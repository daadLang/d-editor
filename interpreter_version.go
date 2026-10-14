package main

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

// Deliberately free of Wails imports so it can be unit tested on its own.

var semverPattern = regexp.MustCompile(`(?i)(?:^|[^0-9a-z])v?(\d+\.\d+\.\d+(?:[-+][0-9a-z.\-+]*)?)`)

// parseVersion extracts a semantic version from arbitrary text such as
// "daad version 0.2.0", "v0.2.0" or "daad_0.2.0_linux_amd64" and returns it
// normalised with a leading "v". It returns "" when no version is present.
func parseVersion(text string) string {
	match := semverPattern.FindStringSubmatch(text)
	if match == nil {
		return ""
	}
	return "v" + strings.TrimRight(match[1], ".-+")
}

// versionFromPath recovers the version of an interpreter that was installed by
// the IDE (…/interpreters/v0.2.0/daad_0.2.0_linux_amd64/daad) from the
// directories above the binary. Used when the binary cannot report a version.
func versionFromPath(path string) string {
	dir := filepath.Dir(path)
	fallback := ""
	for dir != "" && dir != filepath.Dir(dir) {
		base := filepath.Base(dir)
		if version := parseVersion(base); version != "" {
			if strings.HasPrefix(strings.ToLower(base), "v") {
				return version
			}
			fallback = version
		}
		dir = filepath.Dir(dir)
	}
	return fallback
}

// interpreterLabel is the human readable name shown in the UI: "daad v0.2.0".
func interpreterLabel(version string) string {
	if version == "" {
		return "daad"
	}
	return "daad " + version
}

type versionCacheKey struct {
	path    string
	modTime int64
	size    int64
}

var (
	versionCache   = map[versionCacheKey]string{}
	versionCacheMu sync.Mutex
)

// detectVersion uses the installed directory version, then asks the binary
// for its version when no versioned directory is available. Results are cached per file revision because
// listing interpreters would otherwise spawn every binary on each refresh.
func detectVersion(path string) string {
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return ""
	}
	key := versionCacheKey{path: path, modTime: info.ModTime().UnixNano(), size: info.Size()}
	versionCacheMu.Lock()
	cached, ok := versionCache[key]
	versionCacheMu.Unlock()
	if ok {
		return cached
	}

	version := versionFromPath(path)
	if version == "" {
		for _, flag := range []string{"--version", "-v"} {
			if version = runForVersion(path, flag); version != "" {
				break
			}
		}
	}

	versionCacheMu.Lock()
	versionCache[key] = version
	versionCacheMu.Unlock()
	return version
}

func runForVersion(path, flag string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	output, err := exec.CommandContext(ctx, path, flag).CombinedOutput()
	if err != nil {
		return ""
	}
	return parseVersion(string(output))
}
