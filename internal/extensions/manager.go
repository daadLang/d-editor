package extensions

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
)

// Installed is an extension found on disk.
type Installed struct {
	Manifest
	Enabled bool `json:"enabled"`
	// Source is "installed" (from the registry) or "dev" (a folder linked
	// for development; it is never copied or deleted).
	Source string `json:"source"`
	Dir    string `json:"dir,omitempty"` // dev extensions only
	// Error is set when the extension is on disk but unusable.
	Error string `json:"error,omitempty"`
}

// State is what is remembered between runs (extensions.json).
type State struct {
	// Disabled lists extension IDs the user switched off, built-in ones included.
	Disabled []string `json:"disabled"`
	// Dev maps an extension ID to the folder it is linked from.
	Dev map[string]string `json:"dev"`
	// RegistryURL is the registry the store reads; empty means the default.
	RegistryURL string `json:"registryUrl"`
}

// Manager owns <base>/extensions and <base>/extensions.json.
type Manager struct {
	dir       string
	statePath string
	reserved  map[string]bool

	stateMu sync.Mutex // guards extensions.json
	opMu    sync.Mutex // serialises install, uninstall and link
}

// NewManager keeps its files under base (the IDE's data folder). reserved are
// IDs that cannot be installed because the IDE ships them itself.
func NewManager(base string, reserved []string) *Manager {
	r := map[string]bool{}
	for _, id := range reserved {
		r[id] = true
	}
	return &Manager{
		dir:       filepath.Join(base, "extensions"),
		statePath: filepath.Join(base, "extensions.json"),
		reserved:  r,
	}
}

// --- state ----------------------------------------------------------------

func (m *Manager) readState() (State, error) {
	var s State
	data, err := os.ReadFile(m.statePath)
	if errors.Is(err, os.ErrNotExist) {
		return State{Disabled: []string{}, Dev: map[string]string{}}, nil
	}
	if err != nil {
		return s, err
	}
	if err := json.Unmarshal(data, &s); err != nil {
		return s, fmt.Errorf("invalid %s: %w", filepath.Base(m.statePath), err)
	}
	if s.Disabled == nil {
		s.Disabled = []string{}
	}
	if s.Dev == nil {
		s.Dev = map[string]string{}
	}
	return s, nil
}

func (m *Manager) writeState(s State) error {
	if err := os.MkdirAll(filepath.Dir(m.statePath), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	tmp := m.statePath + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, m.statePath)
}

// update applies a change to the state under the lock.
func (m *Manager) update(change func(*State) error) error {
	m.stateMu.Lock()
	defer m.stateMu.Unlock()
	s, err := m.readState()
	if err != nil {
		return err
	}
	if err := change(&s); err != nil {
		return err
	}
	sort.Strings(s.Disabled)
	return m.writeState(s)
}

// State returns the saved state with the effective registry URL filled in.
func (m *Manager) State() (State, error) {
	m.stateMu.Lock()
	defer m.stateMu.Unlock()
	s, err := m.readState()
	if err != nil {
		return s, err
	}
	if s.RegistryURL == "" {
		s.RegistryURL = DefaultRegistryURL
	}
	return s, nil
}

// SetEnabled switches an extension on or off. It works for any ID, so the
// IDE's built-in extensions can be disabled the same way.
func (m *Manager) SetEnabled(id string, enabled bool) error {
	if !ValidID(id) {
		return fmt.Errorf("invalid extension id %q", id)
	}
	return m.update(func(s *State) error {
		kept := s.Disabled[:0]
		for _, d := range s.Disabled {
			if d != id {
				kept = append(kept, d)
			}
		}
		s.Disabled = kept
		if !enabled {
			s.Disabled = append(s.Disabled, id)
		}
		return nil
	})
}

// SetRegistryURL changes the registry. An empty string restores the default.
func (m *Manager) SetRegistryURL(address string) error {
	address = strings.TrimSpace(address)
	if address != "" && address != DefaultRegistryURL {
		if _, err := parseLocation(address); err != nil {
			return err
		}
	}
	if address == DefaultRegistryURL {
		address = ""
	}
	return m.update(func(s *State) error {
		s.RegistryURL = address
		return nil
	})
}

// --- listing --------------------------------------------------------------

// List returns the extensions on disk: installed ones and linked dev folders.
// A dev link shadows an installed extension with the same ID.
func (m *Manager) List() ([]Installed, error) {
	state, err := m.State()
	if err != nil {
		return nil, err
	}
	disabled := map[string]bool{}
	for _, id := range state.Disabled {
		disabled[id] = true
	}

	var list []Installed
	seen := map[string]bool{}

	for id, dir := range state.Dev {
		item := Installed{Source: "dev", Dir: dir, Enabled: !disabled[id]}
		manifest, err := ReadManifest(dir)
		if err != nil {
			item.Manifest = Manifest{ID: id, Name: id}
			item.Error = err.Error()
		} else {
			item.Manifest = manifest
		}
		seen[id] = true
		list = append(list, item)
	}

	entries, err := os.ReadDir(m.dir)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	for _, entry := range entries {
		id := entry.Name()
		if !entry.IsDir() || strings.HasPrefix(id, ".") || seen[id] {
			continue
		}
		item := Installed{Source: "installed", Enabled: !disabled[id]}
		manifest, err := ReadManifest(filepath.Join(m.dir, id))
		switch {
		case err != nil:
			item.Manifest = Manifest{ID: id, Name: id}
			item.Error = err.Error()
		case manifest.ID != id:
			item.Manifest = Manifest{ID: id, Name: id}
			item.Error = fmt.Sprintf("folder %q holds extension %q", id, manifest.ID)
		default:
			item.Manifest = manifest
		}
		list = append(list, item)
	}

	sort.Slice(list, func(i, j int) bool { return list[i].ID < list[j].ID })
	return list, nil
}

// folderFor is where an extension's files are, honouring dev links.
func (m *Manager) folderFor(id string) (string, bool) {
	if !ValidID(id) {
		return "", false
	}
	if state, err := m.State(); err == nil {
		if dir, ok := state.Dev[id]; ok {
			return dir, true
		}
	}
	dir := filepath.Join(m.dir, id)
	if info, err := os.Stat(dir); err == nil && info.IsDir() {
		return dir, true
	}
	return "", false
}

// --- install / uninstall --------------------------------------------------

// Install downloads the extension with the given ID from the registry at
// registryURL, verifies its checksum, and replaces any installed version.
func (m *Manager) Install(ctx context.Context, registryURL, id string) (Installed, error) {
	if m.reserved[id] {
		return Installed{}, fmt.Errorf("%q is built into the IDE", id)
	}
	if !ValidID(id) {
		return Installed{}, fmt.Errorf("invalid extension id %q", id)
	}
	index, base, err := FetchIndex(ctx, registryURL)
	if err != nil {
		return Installed{}, err
	}
	var entry *IndexEntry
	for i := range index.Extensions {
		if index.Extensions[i].ID == id {
			entry = &index.Extensions[i]
			break
		}
	}
	if entry == nil {
		return Installed{}, fmt.Errorf("extension %q is not in the registry", id)
	}
	if entry.API > APIVersion {
		return Installed{}, fmt.Errorf("%s needs extension API %d but this IDE provides %d; update the IDE", entry.Name, entry.API, APIVersion)
	}
	source, err := base.resolve(entry.Download.URL)
	if err != nil {
		return Installed{}, err
	}

	m.opMu.Lock()
	defer m.opMu.Unlock()

	if state, err := m.State(); err == nil {
		if _, linked := state.Dev[id]; linked {
			return Installed{}, fmt.Errorf("%q is linked as a development extension; unlink it first", id)
		}
	}
	if err := os.MkdirAll(m.dir, 0o755); err != nil {
		return Installed{}, err
	}
	archive, err := download(ctx, source, entry.Download.SHA256, m.dir)
	if err != nil {
		return Installed{}, err
	}
	defer os.Remove(archive)

	return m.installArchive(archive, entry.ID, entry.Version)
}

// installArchive unpacks a verified package and moves it into place. The
// manifest inside must agree with the registry entry it came from.
func (m *Manager) installArchive(archive, wantID, wantVersion string) (Installed, error) {
	staging, err := os.MkdirTemp(m.dir, ".install-*")
	if err != nil {
		return Installed{}, err
	}
	defer os.RemoveAll(staging)

	file, err := os.Open(archive)
	if err != nil {
		return Installed{}, err
	}
	err = extractTarGz(file, staging)
	file.Close()
	if err != nil {
		return Installed{}, err
	}

	root, err := manifestRoot(staging)
	if err != nil {
		return Installed{}, err
	}
	manifest, err := ReadManifest(root)
	if err != nil {
		return Installed{}, err
	}
	if manifest.ID != wantID {
		return Installed{}, fmt.Errorf("the package contains %q, not %q", manifest.ID, wantID)
	}
	if manifest.Version != wantVersion {
		return Installed{}, fmt.Errorf("the package is version %s but the registry lists %s", manifest.Version, wantVersion)
	}
	if _, err := os.Stat(filepath.Join(root, filepath.FromSlash(manifest.Main))); err != nil {
		return Installed{}, fmt.Errorf("the package is missing its main file %q", manifest.Main)
	}

	final := filepath.Join(m.dir, manifest.ID)
	aside := ""
	if _, err := os.Stat(final); err == nil {
		aside = filepath.Join(m.dir, ".old-"+manifest.ID)
		os.RemoveAll(aside)
		if err := os.Rename(final, aside); err != nil {
			return Installed{}, fmt.Errorf("cannot replace the installed version: %w", err)
		}
	}
	if err := os.Rename(root, final); err != nil {
		if aside != "" {
			_ = os.Rename(aside, final) // put the old version back
		}
		return Installed{}, err
	}
	if aside != "" {
		os.RemoveAll(aside)
	}

	state, _ := m.State()
	enabled := true
	for _, d := range state.Disabled {
		if d == manifest.ID {
			enabled = false
		}
	}
	return Installed{Manifest: manifest, Source: "installed", Enabled: enabled}, nil
}

// Uninstall removes an installed extension. A linked dev extension is only
// unlinked: the user's folder is never touched.
func (m *Manager) Uninstall(id string) error {
	if !ValidID(id) {
		return fmt.Errorf("invalid extension id %q", id)
	}
	m.opMu.Lock()
	defer m.opMu.Unlock()

	state, err := m.State()
	if err != nil {
		return err
	}
	if _, linked := state.Dev[id]; linked {
		return m.update(func(s *State) error {
			delete(s.Dev, id)
			return nil
		})
	}
	dir := filepath.Join(m.dir, id)
	if _, err := os.Stat(dir); err != nil {
		return fmt.Errorf("extension %q is not installed", id)
	}
	if err := os.RemoveAll(dir); err != nil {
		return err
	}
	// Forget a "disabled" mark so a later reinstall starts enabled.
	return m.update(func(s *State) error {
		kept := s.Disabled[:0]
		for _, d := range s.Disabled {
			if d != id {
				kept = append(kept, d)
			}
		}
		s.Disabled = kept
		return nil
	})
}

// LinkDev registers a folder as a development extension. Its files are served
// straight from that folder, so rebuilding it is enough to see changes.
func (m *Manager) LinkDev(dir string) (Installed, error) {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return Installed{}, err
	}
	manifest, err := ReadManifest(abs)
	if err != nil {
		return Installed{}, err
	}
	if m.reserved[manifest.ID] {
		return Installed{}, fmt.Errorf("%q is built into the IDE", manifest.ID)
	}
	if _, err := os.Stat(filepath.Join(abs, filepath.FromSlash(manifest.Main))); err != nil {
		return Installed{}, fmt.Errorf("%q does not exist yet; build the extension first", manifest.Main)
	}

	m.opMu.Lock()
	defer m.opMu.Unlock()
	if err := m.update(func(s *State) error {
		s.Dev[manifest.ID] = abs
		return nil
	}); err != nil {
		return Installed{}, err
	}
	return Installed{Manifest: manifest, Source: "dev", Dir: abs, Enabled: true}, nil
}

// --- serving --------------------------------------------------------------

// Handler serves extension files at /_ext/<id>/<path>. The webview loads
// extension code from here, which keeps it on the app's own origin and so
// inside the strict Content-Security-Policy.
func (m *Manager) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		rest := strings.TrimPrefix(r.URL.Path, "/_ext/")
		id, rel, found := strings.Cut(rest, "/")
		if !found || rel == "" || !safeRelPath(rel) {
			http.NotFound(w, r)
			return
		}
		dir, ok := m.folderFor(id)
		if !ok {
			http.NotFound(w, r)
			return
		}
		full := filepath.Join(dir, filepath.FromSlash(rel))
		if !strings.HasPrefix(full, filepath.Clean(dir)+string(filepath.Separator)) {
			http.NotFound(w, r)
			return
		}
		file, err := os.Open(full)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		defer file.Close()
		info, err := file.Stat()
		if err != nil || !info.Mode().IsRegular() {
			http.NotFound(w, r)
			return
		}

		w.Header().Set("Content-Type", contentType(full))
		w.Header().Set("X-Content-Type-Options", "nosniff")
		// Extensions can be updated or rebuilt at any time.
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeContent(w, r, info.Name(), info.ModTime(), file)
	})
}

func contentType(name string) string {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".js", ".mjs":
		return "text/javascript; charset=utf-8"
	case ".css":
		return "text/css; charset=utf-8"
	case ".json", ".map":
		return "application/json; charset=utf-8"
	case ".svg":
		return "image/svg+xml"
	}
	if t := mime.TypeByExtension(filepath.Ext(name)); t != "" {
		return t
	}
	return "application/octet-stream"
}
