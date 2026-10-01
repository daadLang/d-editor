package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestSelectInterpreterAssetMatchesPlatform(t *testing.T) {
	assets := []githubAsset{
		{Name: "daad-windows-amd64.zip"},
		{Name: fmt.Sprintf("daad-%s-%s.zip", runtime.GOOS, runtime.GOARCH)},
		{Name: fmt.Sprintf("daad-%s-%s.tar.gz", runtime.GOOS, runtime.GOARCH)},
		{Name: "daad-linux-arm64.tar.gz"},
	}

	asset, err := selectInterpreterAsset(assets)
	if err != nil {
		t.Fatalf("selectInterpreterAsset returned an error: %v", err)
	}
	want := fmt.Sprintf("daad-%s-%s.tar.gz", runtime.GOOS, runtime.GOARCH)
	if asset.Name != want {
		t.Fatalf("selected %q, want %q", asset.Name, want)
	}
}

func TestPreferredArchiveExtensions(t *testing.T) {
	if got := preferredArchiveExtensions("linux")[0]; got != ".tar.gz" {
		t.Fatalf("linux preferred %q, want .tar.gz", got)
	}
	if got := preferredArchiveExtensions("windows")[0]; got != ".zip" {
		t.Fatalf("windows preferred %q, want .zip", got)
	}
}

func TestSelectInterpreterAssetReportsMissingPlatform(t *testing.T) {
	_, err := selectInterpreterAsset([]githubAsset{{Name: "daad-windows-amd64.exe"}})
	if err == nil {
		t.Fatal("selectInterpreterAsset should fail when no matching asset exists")
	}
}

func TestArchiveExtensionRejectsUncompressedAssets(t *testing.T) {
	if archiveExtension("daad-linux-amd64") != "" {
		t.Fatal("uncompressed assets should not be selected")
	}
	if archiveExtension("daad-linux-amd64.tar.gz") != ".tar.gz" {
		t.Fatal("tar.gz assets should be recognized")
	}
}

func TestEnsureInterpreterExecutableRepairsPermissions(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows does not use Unix executable permission bits")
	}
	directory := t.TempDir()
	path := filepath.Join(directory, "daad")
	if err := os.WriteFile(path, []byte("#!/bin/sh\n"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := ensureInterpreterExecutable(path); err != nil {
		t.Fatalf("ensureInterpreterExecutable returned an error: %v", err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm()&0111 == 0 {
		t.Fatalf("interpreter permissions are still %o", info.Mode().Perm())
	}
}
