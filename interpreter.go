package main

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const daadReleasesAPI = "https://api.github.com/repos/daadLang/daad/releases/latest"
const daadReleasesListAPI = "https://api.github.com/repos/daadLang/daad/releases?per_page=20"

type githubRelease struct {
	TagName string        `json:"tag_name"`
	HTMLURL string        `json:"html_url"`
	Assets  []githubAsset `json:"assets"`
}

type githubAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
}

type InterpreterInfo struct {
	Path            string `json:"path"`
	Version         string `json:"version"`
	LatestVersion   string `json:"latestVersion"`
	LatestURL       string `json:"latestUrl"`
	UpdateAvailable bool   `json:"updateAvailable"`
}

type InterpreterOption struct {
	ID         string `json:"id"`
	Label      string `json:"label"`
	Path       string `json:"path"`
	Version    string `json:"version"`
	Source     string `json:"source"`
	ReleaseTag string `json:"releaseTag"`
	ReleaseURL string `json:"releaseUrl"`
	Installed  bool   `json:"installed"`
	Selected   bool   `json:"selected"`
}

func (a *App) SelectInterpreter() (string, error) {
	interpreterDirectory, err := a.interpreterDirectory()
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(interpreterDirectory, 0755); err != nil {
		return "", fmt.Errorf("failed to create interpreter directory: %w", err)
	}
	return wailsruntime.OpenFileDialog(a.ctx, wailsruntime.OpenDialogOptions{
		Title:            "Select Daad interpreter",
		DefaultDirectory: interpreterDirectory,
		ShowHiddenFiles:  true,
		Filters: []wailsruntime.FileFilter{{
			DisplayName: "Daad interpreter",
			Pattern:     "daad;daad.exe;*",
		}},
	})
}

func (a *App) ListInterpreters(configuredPath string) ([]InterpreterOption, error) {
	options := make([]InterpreterOption, 0)
	seenPaths := make(map[string]bool)
	addInstalled := func(path, source, label string) {
		if path == "" || seenPaths[path] {
			return
		}
		seenPaths[path] = true
		version := interpreterVersion(path)
		if label == "" {
			label = "Daad" + versionLabel(version)
		}
		options = append(options, InterpreterOption{
			ID:        "installed:" + path,
			Label:     label,
			Path:      path,
			Version:   version,
			Source:    source,
			Installed: true,
			Selected:  path == configuredPath,
		})
	}

	if configuredPath != "" {
		if _, err := os.Stat(configuredPath); err == nil {
			addInstalled(configuredPath, "selected", "Daad (selected)")
		}
	}
	if systemPath, err := exec.LookPath("daad"); err == nil {
		addInstalled(systemPath, "system", "Daad (system)")
	}
	if directory, err := a.interpreterDirectory(); err == nil {
		_ = filepath.WalkDir(directory, func(path string, entry os.DirEntry, walkErr error) error {
			if walkErr != nil {
				return nil
			}
			if entry.IsDir() || (entry.Name() != "daad" && entry.Name() != "daad.exe") {
				return nil
			}
			addInstalled(path, "downloaded", "")
			return nil
		})
	}

	releases, err := fetchReleases()
	if err != nil {
		return options, nil
	}
	for _, release := range releases {
		if _, err := selectInterpreterAsset(release.Assets); err != nil {
			continue
		}
		installed := findInstalledRelease(options, release.TagName)
		options = append(options, InterpreterOption{
			ID:         "release:" + release.TagName,
			Label:      "Daad " + release.TagName + " (available)",
			Path:       installed,
			Version:    release.TagName,
			Source:     "release",
			ReleaseTag: release.TagName,
			ReleaseURL: release.HTMLURL,
			Installed:  installed != "",
			Selected:   installed != "" && installed == configuredPath,
		})
	}
	return options, nil
}

func (a *App) InterpreterDirectory() (string, error) {
	return a.interpreterDirectory()
}

func (a *App) GetInterpreterInfo(configuredPath string) (InterpreterInfo, error) {
	path := configuredPath
	if path == "" {
		path, _ = exec.LookPath("daad")
	}

	info := InterpreterInfo{Path: path}
	if path != "" {
		info.Version = interpreterVersion(path)
	}

	release, err := fetchLatestRelease()
	if err != nil {
		return info, nil
	}
	info.LatestVersion = release.TagName
	info.LatestURL = release.HTMLURL
	info.UpdateAvailable = info.Version != "" && info.Version != release.TagName
	return info, nil
}

func (a *App) OpenExternalURL(url string) {
	wailsruntime.BrowserOpenURL(a.ctx, url)
}

func (a *App) InstallLatestInterpreter() (string, error) {
	release, err := fetchLatestRelease()
	if err != nil {
		return "", err
	}
	asset, err := selectInterpreterAsset(release.Assets)
	if err != nil {
		return "", err
	}

	return a.installRelease(release, asset)
}

func (a *App) InstallInterpreter(releaseTag string) (string, error) {
	releases, err := fetchReleases()
	if err != nil {
		return "", err
	}
	for _, release := range releases {
		if release.TagName != releaseTag {
			continue
		}
		asset, err := selectInterpreterAsset(release.Assets)
		if err != nil {
			return "", err
		}
		return a.installRelease(release, asset)
	}
	return "", fmt.Errorf("Daad release %s was not found", releaseTag)
}

func (a *App) installRelease(release githubRelease, asset githubAsset) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	installDir := filepath.Join(home, ".daad-ide", "interpreters", release.TagName)
	if err := os.MkdirAll(installDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create interpreter directory: %w", err)
	}

	archivePath := filepath.Join(installDir, asset.Name)
	if err := downloadFile(asset.BrowserDownloadURL, archivePath); err != nil {
		return "", err
	}
	defer os.Remove(archivePath)
	if err := extractInterpreterArchive(archivePath, installDir); err != nil {
		return "", err
	}

	interpreterPath, err := findInterpreterBinary(installDir)
	if err != nil {
		return "", err
	}
	if runtime.GOOS != "windows" {
		if err := os.Chmod(interpreterPath, 0755); err != nil {
			return "", fmt.Errorf("failed to make interpreter executable: %w", err)
		}
	}
	return interpreterPath, nil
}

func (a *App) interpreterDirectory() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".daad-ide", "interpreters"), nil
}

func findInstalledRelease(options []InterpreterOption, releaseTag string) string {
	for _, option := range options {
		if option.Installed && strings.Contains(option.Path, string(filepath.Separator)+releaseTag+string(filepath.Separator)) {
			return option.Path
		}
	}
	return ""
}

func versionLabel(version string) string {
	if version == "" {
		return ""
	}
	return " - " + version
}

func fetchLatestRelease() (githubRelease, error) {
	client := &http.Client{Timeout: 15 * time.Second}
	request, err := http.NewRequest(http.MethodGet, daadReleasesAPI, nil)
	if err != nil {
		return githubRelease{}, err
	}
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("User-Agent", "daad-ide")
	response, err := client.Do(request)
	if err != nil {
		return githubRelease{}, fmt.Errorf("failed to check Daad releases: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return githubRelease{}, fmt.Errorf("GitHub returned status %s", response.Status)
	}

	var release githubRelease
	if err := json.NewDecoder(response.Body).Decode(&release); err != nil {
		return githubRelease{}, fmt.Errorf("failed to read Daad release: %w", err)
	}
	return release, nil
}

func fetchReleases() ([]githubRelease, error) {
	client := &http.Client{Timeout: 15 * time.Second}
	request, err := http.NewRequest(http.MethodGet, daadReleasesListAPI, nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("User-Agent", "daad-ide")
	response, err := client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("failed to check Daad releases: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub returned status %s", response.Status)
	}
	var releases []githubRelease
	if err := json.NewDecoder(response.Body).Decode(&releases); err != nil {
		return nil, fmt.Errorf("failed to read Daad releases: %w", err)
	}
	return releases, nil
}

func selectInterpreterAsset(assets []githubAsset) (githubAsset, error) {
	operatingSystem := runtime.GOOS
	architecture := runtime.GOARCH
	for _, extension := range preferredArchiveExtensions(operatingSystem) {
		for _, asset := range assets {
			name := strings.ToLower(asset.Name)
			if archiveExtension(name) == extension && matchesPlatform(name, operatingSystem, architecture) {
				return asset, nil
			}
		}
	}
	return githubAsset{}, fmt.Errorf("no compressed Daad release asset matches %s/%s", operatingSystem, architecture)
}

func preferredArchiveExtensions(operatingSystem string) []string {
	if operatingSystem == "windows" {
		return []string{".zip", ".tar.gz", ".tgz"}
	}
	return []string{".tar.gz", ".tgz", ".zip"}
}

func matchesPlatform(name, operatingSystem, architecture string) bool {
	osMatches := strings.Contains(name, operatingSystem)
	if operatingSystem == "darwin" {
		osMatches = osMatches || strings.Contains(name, "macos") || strings.Contains(name, "osx")
	}
	archMatches := strings.Contains(name, architecture)
	if architecture == "amd64" {
		archMatches = archMatches || strings.Contains(name, "x86_64") || strings.Contains(name, "x64")
	}
	if architecture == "arm64" {
		archMatches = archMatches || strings.Contains(name, "aarch64")
	}
	return osMatches && archMatches
}

func archiveExtension(name string) string {
	switch {
	case strings.HasSuffix(name, ".tar.gz"):
		return ".tar.gz"
	case strings.HasSuffix(name, ".tgz"):
		return ".tgz"
	case strings.HasSuffix(name, ".zip"):
		return ".zip"
	default:
		return ""
	}
}

func extractInterpreterArchive(archivePath, destination string) error {
	switch archiveExtension(archivePath) {
	case ".zip":
		return extractZip(archivePath, destination)
	case ".tar.gz", ".tgz":
		return extractTarGzip(archivePath, destination)
	default:
		return fmt.Errorf("unsupported interpreter archive: %s", filepath.Base(archivePath))
	}
}

func extractTarGzip(archivePath, destination string) error {
	file, err := os.Open(archivePath)
	if err != nil {
		return err
	}
	defer file.Close()
	compressed, err := gzip.NewReader(file)
	if err != nil {
		return fmt.Errorf("failed to read interpreter archive: %w", err)
	}
	defer compressed.Close()

	reader := tar.NewReader(compressed)
	for {
		header, readErr := reader.Next()
		if errors.Is(readErr, io.EOF) {
			return nil
		}
		if readErr != nil {
			return fmt.Errorf("failed to extract interpreter archive: %w", readErr)
		}
		target, err := safeArchivePath(destination, header.Name)
		if err != nil {
			return err
		}
		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, 0755); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
				return err
			}
			file, err := os.OpenFile(target, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0644)
			if err != nil {
				return err
			}
			_, copyErr := io.Copy(file, reader)
			closeErr := file.Close()
			if copyErr != nil {
				return copyErr
			}
			if closeErr != nil {
				return closeErr
			}
		}
	}
}

func extractZip(archivePath, destination string) error {
	archive, err := zip.OpenReader(archivePath)
	if err != nil {
		return fmt.Errorf("failed to read interpreter archive: %w", err)
	}
	defer archive.Close()
	for _, entry := range archive.File {
		target, err := safeArchivePath(destination, entry.Name)
		if err != nil {
			return err
		}
		if entry.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return err
		}
		input, err := entry.Open()
		if err != nil {
			return err
		}
		output, err := os.OpenFile(target, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0644)
		if err != nil {
			input.Close()
			return err
		}
		_, copyErr := io.Copy(output, input)
		input.Close()
		closeErr := output.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
	}
	return nil
}

func safeArchivePath(destination, archiveName string) (string, error) {
	cleanName := filepath.Clean(filepath.FromSlash(archiveName))
	if cleanName == "." || filepath.IsAbs(cleanName) || cleanName == ".." || strings.HasPrefix(cleanName, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("unsafe path in interpreter archive: %s", archiveName)
	}
	target := filepath.Join(destination, cleanName)
	root, err := filepath.Abs(destination)
	if err != nil {
		return "", err
	}
	target, err = filepath.Abs(target)
	if err != nil {
		return "", err
	}
	if filepath.Dir(target) != root && !strings.HasPrefix(target, root+string(filepath.Separator)) {
		return "", fmt.Errorf("unsafe path in interpreter archive: %s", archiveName)
	}
	return target, nil
}

func findInterpreterBinary(destination string) (string, error) {
	var candidates []string
	err := filepath.WalkDir(destination, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() || strings.HasSuffix(strings.ToLower(entry.Name()), ".zip") || strings.HasSuffix(strings.ToLower(entry.Name()), ".gz") {
			return nil
		}
		name := strings.ToLower(entry.Name())
		if name == "daad" || name == "daad.exe" || strings.Contains(name, "daad") {
			candidates = append(candidates, path)
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	if len(candidates) == 0 {
		return "", errors.New("installed archive does not contain a Daad interpreter binary")
	}
	return candidates[0], nil
}

func downloadFile(url, path string) error {
	client := &http.Client{Timeout: 2 * time.Minute}
	request, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	request.Header.Set("User-Agent", "daad-ide")
	response, err := client.Do(request)
	if err != nil {
		return fmt.Errorf("failed to download interpreter: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("interpreter download returned status %s", response.Status)
	}

	temporaryPath := path + ".download"
	file, err := os.Create(temporaryPath)
	if err != nil {
		return fmt.Errorf("failed to create interpreter download: %w", err)
	}
	if _, err := io.Copy(file, response.Body); err != nil {
		file.Close()
		os.Remove(temporaryPath)
		return fmt.Errorf("failed to save interpreter: %w", err)
	}
	if err := file.Close(); err != nil {
		os.Remove(temporaryPath)
		return err
	}
	if err := os.Rename(temporaryPath, path); err != nil {
		os.Remove(temporaryPath)
		return fmt.Errorf("failed to install interpreter: %w", err)
	}
	return nil
}

func interpreterVersion(path string) string {
	output, err := exec.Command(path, "--version").CombinedOutput()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(output))
}

func resolveInterpreter(configuredPath string) (string, error) {
	var interpreterPath string
	if configuredPath != "" {
		if _, err := os.Stat(configuredPath); err != nil {
			return "", fmt.Errorf("configured interpreter is unavailable: %w", err)
		}
		interpreterPath = configuredPath
	} else {
		path, err := exec.LookPath("daad")
		if err != nil {
			return "", errors.New("Daad interpreter not found; choose or install one in Settings")
		}
		interpreterPath = path
	}
	if err := ensureInterpreterExecutable(interpreterPath); err != nil {
		return "", err
	}
	return interpreterPath, nil
}

func ensureInterpreterExecutable(interpreterPath string) error {
	if runtime.GOOS == "windows" {
		return nil
	}
	info, err := os.Stat(interpreterPath)
	if err != nil {
		return fmt.Errorf("failed to inspect interpreter: %w", err)
	}
	if info.IsDir() {
		return errors.New("configured interpreter path is a directory")
	}
	if info.Mode().Perm()&0111 != 0 {
		return nil
	}
	if err := os.Chmod(interpreterPath, info.Mode().Perm()|0111); err != nil {
		return fmt.Errorf("failed to make interpreter executable: %w", err)
	}
	return nil
}
