package extensions

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// --- helpers ---------------------------------------------------------------

type entry struct {
	name     string
	body     string
	typeflag byte // 0 = regular file
	link     string
}

func makeTarGz(t *testing.T, entries ...entry) []byte {
	t.Helper()
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	for _, e := range entries {
		flag := e.typeflag
		if flag == 0 {
			flag = tar.TypeReg
		}
		h := &tar.Header{Name: e.name, Typeflag: flag, Mode: 0o644, Linkname: e.link}
		if flag == tar.TypeReg {
			h.Size = int64(len(e.body))
		}
		if err := tw.WriteHeader(h); err != nil {
			t.Fatal(err)
		}
		if flag == tar.TypeReg {
			if _, err := tw.Write([]byte(e.body)); err != nil {
				t.Fatal(err)
			}
		}
	}
	tw.Close()
	gz.Close()
	return buf.Bytes()
}

func manifestJSON(id, version string, extra map[string]any) string {
	m := map[string]any{"id": id, "name": "Ext " + id, "version": version, "api": 1}
	for k, v := range extra {
		m[k] = v
	}
	b, _ := json.Marshal(m)
	return string(b)
}

func goodPackage(t *testing.T, id, version string) []byte {
	return makeTarGz(t,
		entry{name: "extension.json", body: manifestJSON(id, version, nil)},
		entry{name: "index.js", body: "export function activate(){}"},
	)
}

func sum(b []byte) string {
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}

// registry builds an index.json plus the given packages and serves them from
// an httptest server. Each package is addressed by a relative URL.
type fixture struct {
	srv   *httptest.Server
	index Index
	files map[string][]byte
}

func newRegistry(t *testing.T, entries ...IndexEntry) *fixture {
	t.Helper()
	f := &fixture{files: map[string][]byte{}}
	f.index = Index{Schema: 1, Extensions: entries}
	f.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/index.json" {
			_ = json.NewEncoder(w).Encode(f.index)
			return
		}
		if b, ok := f.files[strings.TrimPrefix(r.URL.Path, "/")]; ok {
			_, _ = w.Write(b)
			return
		}
		http.NotFound(w, r)
	}))
	t.Cleanup(f.srv.Close)
	return f
}

func (f *fixture) url() string { return f.srv.URL + "/index.json" }

func entryFor(id, version, file string, pkg []byte) IndexEntry {
	return IndexEntry{ID: id, Name: "Ext " + id, Version: version, API: 1,
		Download: Download{URL: file, SHA256: sum(pkg)}}
}

func newManager(t *testing.T) *Manager {
	return NewManager(t.TempDir(), []string{"explorer", "search", "extension-store"})
}

func ctx() context.Context { return context.Background() }

// --- manifest --------------------------------------------------------------

func TestManifestValidation(t *testing.T) {
	ok := Manifest{ID: "hello-world", Name: "Hello", Version: "1.2.3", API: 1}
	if err := ok.Validate(); err != nil {
		t.Fatal(err)
	}
	if ok.Main != "index.js" {
		t.Fatalf("main default = %q", ok.Main)
	}
	bad := map[string]Manifest{
		"upper id":       {ID: "Hello", Name: "x", Version: "1.0.0", API: 1},
		"path in id":     {ID: "../x", Name: "x", Version: "1.0.0", API: 1},
		"no name":        {ID: "x", Version: "1.0.0", API: 1},
		"bad version":    {ID: "x", Name: "x", Version: "1.0", API: 1},
		"no api":         {ID: "x", Name: "x", Version: "1.0.0"},
		"newer api":      {ID: "x", Name: "x", Version: "1.0.0", API: APIVersion + 1},
		"main escapes":   {ID: "x", Name: "x", Version: "1.0.0", API: 1, Main: "../x.js"},
		"main absolute":  {ID: "x", Name: "x", Version: "1.0.0", API: 1, Main: "/x.js"},
		"main not js":    {ID: "x", Name: "x", Version: "1.0.0", API: 1, Main: "x.exe"},
		"main backslash": {ID: "x", Name: "x", Version: "1.0.0", API: 1, Main: `a\x.js`},
		"style escapes":  {ID: "x", Name: "x", Version: "1.0.0", API: 1, Styles: []string{"../a.css"}},
	}
	for name, m := range bad {
		m := m
		if err := m.Validate(); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
}

// --- install ---------------------------------------------------------------

func TestInstallFromRegistry(t *testing.T) {
	m := newManager(t)
	pkg := goodPackage(t, "hello", "1.0.0")
	reg := newRegistry(t, entryFor("hello", "1.0.0", "packages/hello-1.0.0.tar.gz", pkg))
	reg.files["packages/hello-1.0.0.tar.gz"] = pkg // relative to the index URL

	got, err := m.Install(ctx(), reg.url(), "hello")
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != "hello" || got.Version != "1.0.0" || !got.Enabled || got.Source != "installed" {
		t.Fatalf("installed = %+v", got)
	}
	list, _ := m.List()
	if len(list) != 1 || list[0].ID != "hello" {
		t.Fatalf("list = %+v", list)
	}
	if _, err := os.Stat(filepath.Join(m.dir, "hello", "index.js")); err != nil {
		t.Fatal(err)
	}
	// No staging leftovers.
	entries, _ := os.ReadDir(m.dir)
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), ".") {
			t.Fatalf("leftover %s", e.Name())
		}
	}
}

func TestInstallAcceptsAWrapperFolder(t *testing.T) {
	m := newManager(t)
	pkg := makeTarGz(t,
		entry{name: "hello-1.0.0/", typeflag: tar.TypeDir},
		entry{name: "hello-1.0.0/extension.json", body: manifestJSON("hello", "1.0.0", nil)},
		entry{name: "hello-1.0.0/index.js", body: "x"},
	)
	reg := newRegistry(t, entryFor("hello", "1.0.0", "h.tar.gz", pkg))
	reg.files["h.tar.gz"] = pkg
	if _, err := m.Install(ctx(), reg.url(), "hello"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(m.dir, "hello", "index.js")); err != nil {
		t.Fatal(err)
	}
}

func TestInstallRefusesABadChecksum(t *testing.T) {
	m := newManager(t)
	pkg := goodPackage(t, "hello", "1.0.0")
	e := entryFor("hello", "1.0.0", "h.tar.gz", pkg)
	e.Download.SHA256 = strings.Repeat("0", 64)
	reg := newRegistry(t, e)
	reg.files["h.tar.gz"] = pkg
	if _, err := m.Install(ctx(), reg.url(), "hello"); err == nil || !strings.Contains(err.Error(), "checksum") {
		t.Fatalf("err = %v", err)
	}
	if list, _ := m.List(); len(list) != 0 {
		t.Fatalf("nothing may be installed: %+v", list)
	}
	e.Download.SHA256 = ""
	reg.index.Extensions[0] = e
	if _, err := m.Install(ctx(), reg.url(), "hello"); err == nil {
		t.Fatal("a missing checksum must be refused")
	}
}

func TestInstallRefusesHostilePackages(t *testing.T) {
	// Each package is otherwise valid (manifest + main file), so the only thing
	// that can make the install fail is the hostile entry itself.
	valid := []entry{
		{name: "extension.json", body: manifestJSON("hello", "1.0.0", nil)},
		{name: "index.js", body: "export function activate(){}"},
	}
	cases := map[string]entry{
		"parent traversal":  {name: "../evil.js", body: "x"},
		"double traversal":  {name: "../../evil.js", body: "x"},
		"nested traversal":  {name: "a/../../../evil.js", body: "x"},
		"absolute path":     {name: "/tmp/evil-abs.js", body: "x"},
		"symlink":           {name: "link", typeflag: tar.TypeSymlink, link: "/etc/passwd"},
		"hardlink":          {name: "link", typeflag: tar.TypeLink, link: "index.js"},
		"windows traversal": {name: `..\evil.js`, body: "x"},
		"drive letter":      {name: `C:/evil.js`, body: "x"},
		"device":            {name: "dev", typeflag: tar.TypeChar},
	}
	for name, bad := range cases {
		m := newManager(t)
		pkg := makeTarGz(t, append([]entry{bad}, valid...)...)
		reg := newRegistry(t, entryFor("hello", "1.0.0", "h.tar.gz", pkg))
		reg.files["h.tar.gz"] = pkg
		if _, err := m.Install(ctx(), reg.url(), "hello"); err == nil {
			t.Errorf("%s: a hostile package was installed", name)
		}
		base := filepath.Dir(m.dir)
		for _, escaped := range []string{
			filepath.Join(m.dir, "evil.js"), // one level above the staging folder
			filepath.Join(base, "evil.js"),  // two levels above
			filepath.Join(base, "..", "evil.js"),
		} {
			if _, err := os.Stat(escaped); err == nil {
				t.Errorf("%s: a file escaped to %s", name, escaped)
			}
		}
		if list, _ := m.List(); len(list) != 0 {
			t.Errorf("%s: installed despite the error: %+v", name, list)
		}
	}
	// Sanity: the same package without the hostile entry installs fine, so the
	// failures above really are about that entry.
	m := newManager(t)
	pkg := makeTarGz(t, valid...)
	reg := newRegistry(t, entryFor("hello", "1.0.0", "h.tar.gz", pkg))
	reg.files["h.tar.gz"] = pkg
	if _, err := m.Install(ctx(), reg.url(), "hello"); err != nil {
		t.Fatalf("control package failed: %v", err)
	}
}

func TestInstallChecksTheManifestAgainstTheRegistry(t *testing.T) {
	cases := map[string]struct {
		pkg   []byte
		entry func(IndexEntry) IndexEntry
	}{
		"other id": {
			pkg:   goodPackage(t, "other", "1.0.0"),
			entry: func(e IndexEntry) IndexEntry { return e },
		},
		"other version": {
			pkg:   goodPackage(t, "hello", "2.0.0"),
			entry: func(e IndexEntry) IndexEntry { return e },
		},
		"no manifest": {
			pkg:   makeTarGz(t, entry{name: "index.js", body: "x"}),
			entry: func(e IndexEntry) IndexEntry { return e },
		},
		"no main file": {
			pkg:   makeTarGz(t, entry{name: "extension.json", body: manifestJSON("hello", "1.0.0", nil)}),
			entry: func(e IndexEntry) IndexEntry { return e },
		},
		"not a tarball": {
			pkg:   []byte("hello"),
			entry: func(e IndexEntry) IndexEntry { return e },
		},
	}
	for name, c := range cases {
		m := newManager(t)
		e := entryFor("hello", "1.0.0", "h.tar.gz", c.pkg)
		reg := newRegistry(t, c.entry(e))
		reg.files["h.tar.gz"] = c.pkg
		if _, err := m.Install(ctx(), reg.url(), "hello"); err == nil {
			t.Errorf("%s: expected an error", name)
		}
		if list, _ := m.List(); len(list) != 0 {
			t.Errorf("%s: installed despite the error", name)
		}
	}
}

func TestInstallRefusesReservedMissingAndTooNew(t *testing.T) {
	m := newManager(t)
	pkg := goodPackage(t, "search", "1.0.0")
	reg := newRegistry(t, entryFor("search", "1.0.0", "s.tar.gz", pkg))
	reg.files["s.tar.gz"] = pkg
	if _, err := m.Install(ctx(), reg.url(), "search"); err == nil || !strings.Contains(err.Error(), "built into") {
		t.Fatalf("built-in ids must be refused, got %v", err)
	}
	if _, err := m.Install(ctx(), reg.url(), "nope"); err == nil || !strings.Contains(err.Error(), "not in the registry") {
		t.Fatalf("err = %v", err)
	}
	newer := entryFor("fancy", "1.0.0", "f.tar.gz", pkg)
	newer.API = APIVersion + 1
	reg.index.Extensions = append(reg.index.Extensions, newer)
	if _, err := m.Install(ctx(), reg.url(), "fancy"); err == nil || !strings.Contains(err.Error(), "API") {
		t.Fatalf("err = %v", err)
	}
}

func TestUpdateReplacesTheOldVersion(t *testing.T) {
	m := newManager(t)
	v1 := goodPackage(t, "hello", "1.0.0")
	v2 := makeTarGz(t,
		entry{name: "extension.json", body: manifestJSON("hello", "1.1.0", nil)},
		entry{name: "index.js", body: "new"},
		entry{name: "extra.css", body: "x"},
	)
	reg := newRegistry(t, entryFor("hello", "1.0.0", "v1.tar.gz", v1))
	reg.files["v1.tar.gz"], reg.files["v2.tar.gz"] = v1, v2
	if _, err := m.Install(ctx(), reg.url(), "hello"); err != nil {
		t.Fatal(err)
	}
	reg.index.Extensions[0] = entryFor("hello", "1.1.0", "v2.tar.gz", v2)
	got, err := m.Install(ctx(), reg.url(), "hello")
	if err != nil || got.Version != "1.1.0" {
		t.Fatalf("got=%+v err=%v", got, err)
	}
	data, _ := os.ReadFile(filepath.Join(m.dir, "hello", "index.js"))
	if string(data) != "new" {
		t.Fatalf("index.js = %q", data)
	}
	entries, _ := os.ReadDir(m.dir)
	if len(entries) != 1 {
		t.Fatalf("leftovers: %v", entries)
	}
}

func TestAFailedUpdateKeepsTheWorkingVersion(t *testing.T) {
	m := newManager(t)
	v1 := goodPackage(t, "hello", "1.0.0")
	reg := newRegistry(t, entryFor("hello", "1.0.0", "v1.tar.gz", v1))
	reg.files["v1.tar.gz"] = v1
	if _, err := m.Install(ctx(), reg.url(), "hello"); err != nil {
		t.Fatal(err)
	}
	bad := entryFor("hello", "1.1.0", "v2.tar.gz", []byte("junk"))
	reg.index.Extensions[0] = bad
	reg.files["v2.tar.gz"] = []byte("junk")
	if _, err := m.Install(ctx(), reg.url(), "hello"); err == nil {
		t.Fatal("expected a failure")
	}
	list, _ := m.List()
	if len(list) != 1 || list[0].Version != "1.0.0" || list[0].Error != "" {
		t.Fatalf("the old version must survive: %+v", list)
	}
}

func TestLocalFolderRegistry(t *testing.T) {
	// A registry can be a plain folder: index.json next to the packages.
	m := newManager(t)
	dir := t.TempDir()
	pkg := goodPackage(t, "hello", "1.0.0")
	os.WriteFile(filepath.Join(dir, "hello.tar.gz"), pkg, 0o644)
	idx, _ := json.Marshal(Index{Schema: 1, Extensions: []IndexEntry{entryFor("hello", "1.0.0", "hello.tar.gz", pkg)}})
	os.WriteFile(filepath.Join(dir, "index.json"), idx, 0o644)

	if _, err := m.Install(ctx(), filepath.Join(dir, "index.json"), "hello"); err != nil {
		t.Fatal(err)
	}
	if _, err := m.Install(ctx(), "file://"+filepath.ToSlash(filepath.Join(dir, "index.json")), "hello"); err != nil {
		t.Fatalf("file:// url: %v", err)
	}
}

func TestRemoteRegistryCannotPointAtLocalFiles(t *testing.T) {
	m := newManager(t)
	secret := filepath.Join(t.TempDir(), "x.tar.gz")
	pkg := goodPackage(t, "hello", "1.0.0")
	os.WriteFile(secret, pkg, 0o644)
	reg := newRegistry(t, entryFor("hello", "1.0.0", "file://"+filepath.ToSlash(secret), pkg))
	if _, err := m.Install(ctx(), reg.url(), "hello"); err == nil || !strings.Contains(err.Error(), "local files") {
		t.Fatalf("err = %v", err)
	}
}

func TestPlainHTTPIsOnlyAllowedForLoopback(t *testing.T) {
	if _, err := parseLocation("http://example.com/index.json"); err == nil {
		t.Fatal("plain http to a remote host must be refused")
	}
	for _, ok := range []string{"http://127.0.0.1:8080/i.json", "http://localhost/i.json", "http://[::1]:9/i.json", "https://example.com/i.json"} {
		if _, err := parseLocation(ok); err != nil {
			t.Errorf("%s: %v", ok, err)
		}
	}
	if _, err := parseLocation("ftp://example.com/i.json"); err == nil {
		t.Fatal("ftp must be refused")
	}
}

func TestIndexDropsBrokenEntries(t *testing.T) {
	pkg := goodPackage(t, "hello", "1.0.0")
	reg := newRegistry(t,
		entryFor("hello", "1.0.0", "h.tar.gz", pkg),
		IndexEntry{ID: "../evil", Name: "x", Version: "1.0.0"},
		IndexEntry{ID: "noversion", Name: "x", Version: "latest"},
	)
	index, _, err := FetchIndex(ctx(), reg.url())
	if err != nil {
		t.Fatal(err)
	}
	if len(index.Extensions) != 1 || index.Extensions[0].ID != "hello" {
		t.Fatalf("entries = %+v", index.Extensions)
	}
}

func TestUnreachableRegistryGivesAnError(t *testing.T) {
	srv := httptest.NewServer(http.NotFoundHandler())
	url := srv.URL + "/index.json"
	if _, _, err := FetchIndex(ctx(), url); err == nil || !strings.Contains(err.Error(), "404") {
		t.Fatalf("err = %v", err)
	}
	srv.Close()
	if _, _, err := FetchIndex(ctx(), url); err == nil {
		t.Fatal("expected a connection error")
	}
}

// --- state, uninstall, dev -------------------------------------------------

func TestEnabledStatePersists(t *testing.T) {
	base := t.TempDir()
	m := NewManager(base, nil)
	if err := m.SetEnabled("explorer", false); err != nil {
		t.Fatal(err)
	}
	m.SetEnabled("search", false)
	m.SetEnabled("search", true)
	s, _ := NewManager(base, nil).State() // a fresh manager reads the file
	if !reflect.DeepEqual(s.Disabled, []string{"explorer"}) {
		t.Fatalf("disabled = %v", s.Disabled)
	}
	if s.RegistryURL != DefaultRegistryURL {
		t.Fatalf("registry = %q", s.RegistryURL)
	}
	if err := m.SetEnabled("../x", false); err == nil {
		t.Fatal("bad ids must be refused")
	}
}

func TestRegistryURLSetting(t *testing.T) {
	m := newManager(t)
	if err := m.SetRegistryURL("http://example.com/i.json"); err == nil {
		t.Fatal("plain http remote must be refused")
	}
	if err := m.SetRegistryURL("https://example.com/i.json"); err != nil {
		t.Fatal(err)
	}
	if s, _ := m.State(); s.RegistryURL != "https://example.com/i.json" {
		t.Fatalf("registry = %q", s.RegistryURL)
	}
	m.SetRegistryURL("")
	if s, _ := m.State(); s.RegistryURL != DefaultRegistryURL {
		t.Fatalf("reset failed: %q", s.RegistryURL)
	}
}

func TestUninstall(t *testing.T) {
	m := newManager(t)
	pkg := goodPackage(t, "hello", "1.0.0")
	reg := newRegistry(t, entryFor("hello", "1.0.0", "h.tar.gz", pkg))
	reg.files["h.tar.gz"] = pkg
	m.Install(ctx(), reg.url(), "hello")
	m.SetEnabled("hello", false)
	if err := m.Uninstall("hello"); err != nil {
		t.Fatal(err)
	}
	if list, _ := m.List(); len(list) != 0 {
		t.Fatalf("list = %+v", list)
	}
	if s, _ := m.State(); len(s.Disabled) != 0 {
		t.Fatalf("the disabled mark must go too: %v", s.Disabled)
	}
	if err := m.Uninstall("hello"); err == nil {
		t.Fatal("uninstalling twice must report an error")
	}
	// A reinstall starts enabled.
	got, _ := m.Install(ctx(), reg.url(), "hello")
	if !got.Enabled {
		t.Fatal("reinstalled extension should be enabled")
	}
}

func TestDisabledExtensionsStayListedButFlagged(t *testing.T) {
	m := newManager(t)
	pkg := goodPackage(t, "hello", "1.0.0")
	reg := newRegistry(t, entryFor("hello", "1.0.0", "h.tar.gz", pkg))
	reg.files["h.tar.gz"] = pkg
	m.Install(ctx(), reg.url(), "hello")
	m.SetEnabled("hello", false)
	list, _ := m.List()
	if len(list) != 1 || list[0].Enabled {
		t.Fatalf("list = %+v", list)
	}
}

func devFolder(t *testing.T, id string) string {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "extension.json"), []byte(manifestJSON(id, "0.0.1", nil)), 0o644)
	os.WriteFile(filepath.Join(dir, "index.js"), []byte("dev"), 0o644)
	return dir
}

func TestDevLinkServesFromTheFolderAndNeverDeletesIt(t *testing.T) {
	m := newManager(t)
	dir := devFolder(t, "mine")
	got, err := m.LinkDev(dir)
	if err != nil || got.Source != "dev" || got.Dir == "" {
		t.Fatalf("got=%+v err=%v", got, err)
	}
	list, _ := m.List()
	if len(list) != 1 || list[0].Source != "dev" {
		t.Fatalf("list = %+v", list)
	}
	// Edits show up without relinking.
	os.WriteFile(filepath.Join(dir, "index.js"), []byte("edited"), 0o644)
	rec := httptest.NewRecorder()
	m.Handler().ServeHTTP(rec, httptest.NewRequest("GET", "/_ext/mine/index.js", nil))
	if rec.Body.String() != "edited" {
		t.Fatalf("served %q", rec.Body.String())
	}
	if err := m.Uninstall("mine"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, "index.js")); err != nil {
		t.Fatal("unlinking must not delete the user's folder")
	}
	if list, _ := m.List(); len(list) != 0 {
		t.Fatalf("still listed: %+v", list)
	}
}

func TestDevLinkRefusals(t *testing.T) {
	m := newManager(t)
	if _, err := m.LinkDev(devFolder(t, "search")); err == nil {
		t.Fatal("built-in ids must be refused")
	}
	empty := t.TempDir()
	if _, err := m.LinkDev(empty); err == nil {
		t.Fatal("a folder without a manifest must be refused")
	}
	unbuilt := t.TempDir()
	os.WriteFile(filepath.Join(unbuilt, "extension.json"), []byte(manifestJSON("mine", "0.0.1", nil)), 0o644)
	if _, err := m.LinkDev(unbuilt); err == nil || !strings.Contains(err.Error(), "build") {
		t.Fatalf("err = %v", err)
	}
	// A dev link blocks installing the same id from the registry.
	m.LinkDev(devFolder(t, "mine"))
	pkg := goodPackage(t, "mine", "1.0.0")
	reg := newRegistry(t, entryFor("mine", "1.0.0", "m.tar.gz", pkg))
	reg.files["m.tar.gz"] = pkg
	if _, err := m.Install(ctx(), reg.url(), "mine"); err == nil || !strings.Contains(err.Error(), "linked") {
		t.Fatalf("err = %v", err)
	}
}

func TestBrokenExtensionsAreListedWithAnError(t *testing.T) {
	m := newManager(t)
	os.MkdirAll(filepath.Join(m.dir, "broken"), 0o755)
	os.WriteFile(filepath.Join(m.dir, "broken", "extension.json"), []byte("{nope"), 0o644)
	os.MkdirAll(filepath.Join(m.dir, "mismatch"), 0o755)
	os.WriteFile(filepath.Join(m.dir, "mismatch", "extension.json"), []byte(manifestJSON("other", "1.0.0", nil)), 0o644)
	os.MkdirAll(filepath.Join(m.dir, ".install-123"), 0o755) // staging: ignored
	list, err := m.List()
	if err != nil || len(list) != 2 {
		t.Fatalf("list=%+v err=%v", list, err)
	}
	for _, item := range list {
		if item.Error == "" {
			t.Errorf("%s should carry an error", item.ID)
		}
	}
}

// --- serving ---------------------------------------------------------------

func TestHandler(t *testing.T) {
	m := newManager(t)
	pkg := makeTarGz(t,
		entry{name: "extension.json", body: manifestJSON("hello", "1.0.0", nil)},
		entry{name: "index.js", body: "export const a = 1"},
		entry{name: "dist/style.css", body: "a{}"},
	)
	reg := newRegistry(t, entryFor("hello", "1.0.0", "h.tar.gz", pkg))
	reg.files["h.tar.gz"] = pkg
	m.Install(ctx(), reg.url(), "hello")
	// A file next to the extensions folder that must stay unreachable.
	os.WriteFile(filepath.Join(m.dir, "secret.txt"), []byte("secret"), 0o644)

	get := func(path string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		m.Handler().ServeHTTP(rec, httptest.NewRequest("GET", path, nil))
		return rec
	}
	rec := get("/_ext/hello/index.js")
	if rec.Code != 200 || rec.Body.String() != "export const a = 1" {
		t.Fatalf("code=%d body=%q", rec.Code, rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/javascript") {
		t.Fatalf("content type = %q (modules need a JavaScript type)", ct)
	}
	if rec.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatal("missing nosniff")
	}
	if ct := get("/_ext/hello/dist/style.css").Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/css") {
		t.Fatalf("css type = %q", ct)
	}
	for _, p := range []string{
		"/_ext/hello/../secret.txt",
		"/_ext/hello/%2e%2e/secret.txt",
		"/_ext/hello/..%2fsecret.txt",
		"/_ext/..%2fhello/index.js",
		"/_ext/hello/",
		"/_ext/hello",
		"/_ext/hello/dist",
		"/_ext/hello/missing.js",
		"/_ext/unknown/index.js",
		"/_ext/Hello/index.js",
		"/_ext/hello/extension.json/../../secret.txt",
	} {
		if code := get(p).Code; code != 404 {
			t.Errorf("%s -> %d, want 404", p, code)
		}
	}
	post := httptest.NewRecorder()
	m.Handler().ServeHTTP(post, httptest.NewRequest("POST", "/_ext/hello/index.js", nil))
	if post.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST -> %d", post.Code)
	}
}
