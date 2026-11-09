package extensions

import (
	"archive/tar"
	"compress/gzip"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"
)

const (
	maxArchiveFiles = 2000
	maxUnpackedSize = 100 << 20
)

// extractTarGz unpacks a .tar.gz into dest. Packages come from the network, so
// everything that could write outside dest or plant a link is refused: absolute
// and ".." paths, symlinks, hard links and devices. File modes are ignored.
func extractTarGz(r io.Reader, dest string) error {
	gz, err := gzip.NewReader(r)
	if err != nil {
		return fmt.Errorf("not a valid .tar.gz package: %w", err)
	}
	defer gz.Close()

	root, err := filepath.Abs(dest)
	if err != nil {
		return err
	}
	tr := tar.NewReader(gz)
	var files int
	var total int64

	for {
		header, err := tr.Next()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("corrupt package: %w", err)
		}

		switch header.Typeflag {
		case tar.TypeXGlobalHeader: // added by `git archive`; carries no file
			continue
		case tar.TypeReg, tar.TypeDir:
		default:
			return fmt.Errorf("package entry %q has a type that is not allowed", header.Name)
		}

		name := strings.TrimPrefix(header.Name, "./")
		if name == "" || name == "." {
			continue
		}
		if !safeEntryName(name) {
			return fmt.Errorf("package entry %q has an unsafe path", header.Name)
		}
		target := filepath.Join(root, filepath.FromSlash(name))
		if target != root && !strings.HasPrefix(target, root+string(filepath.Separator)) {
			return fmt.Errorf("package entry %q escapes the extension folder", header.Name)
		}

		if header.Typeflag == tar.TypeDir {
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
			continue
		}

		files++
		if files > maxArchiveFiles {
			return fmt.Errorf("package has more than %d files", maxArchiveFiles)
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		out, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
		if err != nil {
			return fmt.Errorf("cannot write %q: %w", name, err)
		}
		// Count what is actually written, not what the header claims.
		n, copyErr := io.Copy(out, io.LimitReader(tr, maxUnpackedSize-total+1))
		closeErr := out.Close()
		total += n
		if total > maxUnpackedSize {
			return fmt.Errorf("package is larger than %d MB when unpacked", maxUnpackedSize>>20)
		}
		if copyErr != nil {
			return fmt.Errorf("corrupt package: %w", copyErr)
		}
		if closeErr != nil {
			return closeErr
		}
	}
}

func safeEntryName(name string) bool {
	if strings.Contains(name, "\\") || strings.HasPrefix(name, "/") || strings.Contains(name, ":") {
		return false
	}
	for _, part := range strings.Split(path.Clean(name), "/") {
		if part == ".." {
			return false
		}
	}
	return true
}

// manifestRoot finds the folder holding extension.json: the unpack folder
// itself, or the single folder inside it (as GitHub's own archives have).
func manifestRoot(dir string) (string, error) {
	if _, err := os.Stat(filepath.Join(dir, ManifestFile)); err == nil {
		return dir, nil
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return "", err
	}
	if len(entries) == 1 && entries[0].IsDir() {
		inner := filepath.Join(dir, entries[0].Name())
		if _, err := os.Stat(filepath.Join(inner, ManifestFile)); err == nil {
			return inner, nil
		}
	}
	return "", fmt.Errorf("package has no %s at its root", ManifestFile)
}
