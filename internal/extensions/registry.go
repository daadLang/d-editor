package extensions

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// DefaultRegistryURL is where the store looks for extensions until the user
// points it somewhere else. It is the index published by the extensions
// registry repository; change it here if the registry lives elsewhere.
const DefaultRegistryURL = "https://daadlang.github.io/extensions/index.json"

const (
	maxIndexSize   = 4 << 20
	maxPackageSize = 64 << 20
)

// Index is the registry's index.json.
type Index struct {
	Schema     int          `json:"schema"`
	Extensions []IndexEntry `json:"extensions"`
}

// IndexEntry is one extension in the registry.
type IndexEntry struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Version     string   `json:"version"`
	Description string   `json:"description,omitempty"`
	Authors     []string `json:"authors,omitempty"`
	Repository  string   `json:"repository,omitempty"`
	Permissions []string `json:"permissions,omitempty"`
	API         int      `json:"api"`
	Download    Download `json:"download"`
}

// Download says where a package is and how to verify it. A relative URL is
// resolved against the index's own location, so a registry can be a plain
// folder (or a local directory) holding index.json and the packages.
type Download struct {
	URL    string `json:"url"`
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size,omitempty"`
}

// location is a parsed registry or package address.
type location struct{ u *url.URL }

func (l location) isFile() bool { return l.u.Scheme == "file" }

// parseLocation accepts http(s) URLs, file:// URLs and plain local paths.
func parseLocation(s string) (location, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return location{}, errors.New("empty address")
	}
	if strings.HasPrefix(s, "http://") || strings.HasPrefix(s, "https://") || strings.HasPrefix(s, "file://") {
		u, err := url.Parse(s)
		if err != nil {
			return location{}, fmt.Errorf("invalid address: %w", err)
		}
		return checkLocation(location{u})
	}
	if scheme, _, found := strings.Cut(s, "://"); found {
		return location{}, fmt.Errorf("unsupported address scheme %q", scheme)
	}
	abs, err := filepath.Abs(s)
	if err != nil {
		return location{}, err
	}
	return location{&url.URL{Scheme: "file", Path: filepath.ToSlash(abs)}}, nil
}

// checkLocation enforces https for anything remote. Plain http is allowed only
// for loopback, which is what a registry served during development looks like.
func checkLocation(l location) (location, error) {
	switch l.u.Scheme {
	case "https", "file":
		return l, nil
	case "http":
		host := l.u.Hostname()
		if host == "localhost" {
			return l, nil
		}
		if ip := net.ParseIP(host); ip != nil && ip.IsLoopback() {
			return l, nil
		}
		return location{}, fmt.Errorf("%s is not allowed: remote addresses must use https", l.u.Redacted())
	}
	return location{}, fmt.Errorf("unsupported address scheme %q", l.u.Scheme)
}

// resolve turns a (possibly relative) download URL into a location. An index
// that was fetched from the network may only point at the network; one read
// from disk may also point at files.
func (l location) resolve(ref string) (location, error) {
	refURL, err := url.Parse(ref)
	if err != nil {
		return location{}, fmt.Errorf("invalid download url: %w", err)
	}
	next, err := checkLocation(location{l.u.ResolveReference(refURL)})
	if err != nil {
		return location{}, err
	}
	if !l.isFile() && next.isFile() {
		return location{}, errors.New("a remote registry cannot point at local files")
	}
	return next, nil
}

func httpClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout: timeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return errors.New("too many redirects")
			}
			_, err := checkLocation(location{req.URL})
			return err
		},
	}
}

// open returns a reader for the location, capped at limit bytes.
func (l location) open(ctx context.Context, timeout time.Duration, limit int64) (io.ReadCloser, error) {
	if l.isFile() {
		file, err := os.Open(filepath.FromSlash(l.u.Path))
		if err != nil {
			return nil, err
		}
		return limited{io.LimitReader(file, limit+1), file}, nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, l.u.String(), nil)
	if err != nil {
		return nil, err
	}
	resp, err := httpClient(timeout).Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return nil, fmt.Errorf("%s answered %s", l.u.Redacted(), resp.Status)
	}
	return limited{io.LimitReader(resp.Body, limit+1), resp.Body}, nil
}

type limited struct {
	io.Reader
	io.Closer
}

// FetchIndex downloads and parses the registry index at address.
func FetchIndex(ctx context.Context, address string) (Index, location, error) {
	loc, err := parseLocation(address)
	if err != nil {
		return Index{}, location{}, err
	}
	body, err := loc.open(ctx, 20*time.Second, maxIndexSize)
	if err != nil {
		return Index{}, location{}, fmt.Errorf("cannot reach the extension registry: %w", err)
	}
	defer body.Close()

	data, err := io.ReadAll(body)
	if err != nil {
		return Index{}, location{}, fmt.Errorf("cannot read the extension registry: %w", err)
	}
	if len(data) > maxIndexSize {
		return Index{}, location{}, errors.New("the extension registry index is too large")
	}
	var index Index
	if err := json.Unmarshal(data, &index); err != nil {
		return Index{}, location{}, fmt.Errorf("the extension registry index is not valid JSON: %w", err)
	}

	// Drop entries that cannot be installed rather than failing the whole list.
	valid := index.Extensions[:0]
	for _, entry := range index.Extensions {
		if ValidID(entry.ID) && entry.Name != "" && versionPattern.MatchString(entry.Version) {
			valid = append(valid, entry)
		}
	}
	index.Extensions = valid
	return index, loc, nil
}

// download saves a package to a temporary file next to dir, verifying its
// SHA-256 while it streams in, and returns the file's path.
func download(ctx context.Context, from location, wantSHA string, dir string) (string, error) {
	wantSHA = strings.ToLower(strings.TrimSpace(wantSHA))
	if len(wantSHA) != 64 {
		return "", errors.New("the registry entry has no valid sha256 checksum")
	}
	body, err := from.open(ctx, 5*time.Minute, maxPackageSize)
	if err != nil {
		return "", fmt.Errorf("download failed: %w", err)
	}
	defer body.Close()

	tmp, err := os.CreateTemp(dir, ".download-*.tar.gz")
	if err != nil {
		return "", err
	}
	hash := sha256.New()
	n, copyErr := io.Copy(io.MultiWriter(tmp, hash), body)
	closeErr := tmp.Close()
	fail := func(err error) (string, error) {
		os.Remove(tmp.Name())
		return "", err
	}
	if copyErr != nil {
		return fail(fmt.Errorf("download failed: %w", copyErr))
	}
	if closeErr != nil {
		return fail(closeErr)
	}
	if n > maxPackageSize {
		return fail(fmt.Errorf("package is larger than %d MB", maxPackageSize>>20))
	}
	if got := hex.EncodeToString(hash.Sum(nil)); got != wantSHA {
		return fail(errors.New("the downloaded package does not match its checksum"))
	}
	return tmp.Name(), nil
}
