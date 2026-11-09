// Package extensions manages the extensions installed on this machine:
// reading their manifests, installing and removing them, remembering which are
// disabled, talking to the extension registry, and serving their files to the
// webview.
//
// It is plain Go with no Wails dependency, so it can be tested on its own.
package extensions

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"
)

// APIVersion is the version of the extension API this IDE offers. An extension
// declares the version it was built for in its manifest ("api"); one that
// needs a newer API than this is refused.
const APIVersion = 1

// ManifestFile is the name of the manifest at the root of every extension.
const ManifestFile = "extension.json"

var (
	idPattern      = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,62}$`)
	versionPattern = regexp.MustCompile(`^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$`)
)

// Manifest describes an extension. It lives in extension.json.
type Manifest struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Version     string   `json:"version"`
	Description string   `json:"description,omitempty"`
	Authors     []string `json:"authors,omitempty"`
	Repository  string   `json:"repository,omitempty"`
	// Main is the JavaScript module that exports `activate`. Defaults to
	// "index.js". Styles are CSS files loaded together with it.
	Main   string   `json:"main"`
	Styles []string `json:"styles,omitempty"`
	// Permissions are shown to the user before installing. In this version they
	// are informational: extensions run with the IDE's full privileges.
	Permissions []string `json:"permissions,omitempty"`
	// API is the extension API version the extension was built for.
	API int `json:"api"`
}

// ValidID reports whether s can be used as an extension ID.
func ValidID(s string) bool { return idPattern.MatchString(s) }

// safeRelPath accepts only plain relative slash-separated paths that stay
// inside the extension folder.
func safeRelPath(p string) bool {
	if p == "" || strings.Contains(p, "\\") || strings.HasPrefix(p, "/") {
		return false
	}
	if path.Clean(p) != p {
		return false
	}
	for _, part := range strings.Split(p, "/") {
		if part == ".." || part == "" {
			return false
		}
	}
	return !strings.Contains(p, ":")
}

// Validate checks the manifest and fills in defaults.
func (m *Manifest) Validate() error {
	if !ValidID(m.ID) {
		return fmt.Errorf("invalid extension id %q (use lowercase letters, digits and hyphens)", m.ID)
	}
	if strings.TrimSpace(m.Name) == "" {
		return errors.New("manifest has no name")
	}
	if !versionPattern.MatchString(m.Version) {
		return fmt.Errorf("invalid version %q (expected x.y.z)", m.Version)
	}
	if m.Main == "" {
		m.Main = "index.js"
	}
	if !safeRelPath(m.Main) || !(strings.HasSuffix(m.Main, ".js") || strings.HasSuffix(m.Main, ".mjs")) {
		return fmt.Errorf("invalid main %q (expected a relative .js file)", m.Main)
	}
	for _, style := range m.Styles {
		if !safeRelPath(style) || !strings.HasSuffix(style, ".css") {
			return fmt.Errorf("invalid style %q (expected a relative .css file)", style)
		}
	}
	if m.API < 1 {
		return errors.New(`manifest must declare the extension API version it targets ("api")`)
	}
	if m.API > APIVersion {
		return fmt.Errorf("needs extension API %d but this IDE provides %d; update the IDE", m.API, APIVersion)
	}
	return nil
}

// ReadManifest loads and validates the manifest in dir.
func ReadManifest(dir string) (Manifest, error) {
	data, err := os.ReadFile(filepath.Join(dir, ManifestFile))
	if err != nil {
		return Manifest{}, fmt.Errorf("cannot read %s: %w", ManifestFile, err)
	}
	var m Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return Manifest{}, fmt.Errorf("invalid %s: %w", ManifestFile, err)
	}
	if err := m.Validate(); err != nil {
		return Manifest{}, err
	}
	return m, nil
}
