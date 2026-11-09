package search

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Position is a match the caller wants replaced: the Line, Column and Length
// that a search reported for it.
type Position struct {
	Line   int `json:"line"`
	Column int `json:"column"`
	Length int `json:"length"`
}

// Target is a file and the matches in it to replace.
type Target struct {
	Path    string     `json:"path"`
	Matches []Position `json:"matches"`
}

// Edit is one replacement: the range of the original text and what replaces it.
type Edit struct {
	Line   int    `json:"line"`
	Column int    `json:"column"`
	Length int    `json:"length"`
	Text   string `json:"text"`
}

// FileEdits is the outcome for one file.
type FileEdits struct {
	Path  string `json:"path"`
	Edits []Edit `json:"edits"`
	// Written is true when the file on disk was changed. Files that were given
	// in Options.Unsaved are never written: their edits are returned for the
	// caller to apply to its buffer.
	Written bool `json:"written"`
	// Skipped counts matches that were no longer there (the file changed since
	// the search); they are left alone.
	Skipped int    `json:"skipped"`
	Error   string `json:"error,omitempty"`
}

// Replace replaces the given matches. The query options say what a match is;
// each requested position is checked against a fresh search of its line, so a
// file edited since the results were shown is never corrupted: positions that
// no longer match are skipped. Targets outside the root are refused.
func Replace(opts Options, replacement string, targets []Target) ([]FileEdits, error) {
	s, err := New(opts)
	if err != nil {
		return nil, err
	}
	results := make([]FileEdits, 0, len(targets))
	for _, target := range targets {
		results = append(results, s.replaceFile(target, replacement))
	}
	return results, nil
}

func (s *Search) inRoot(path string) bool {
	rel, err := filepath.Rel(s.root, filepath.Clean(path))
	return err == nil && rel != "." && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

func (s *Search) replaceFile(target Target, replacement string) FileEdits {
	result := FileEdits{Path: target.Path, Edits: []Edit{}}
	fail := func(err error) FileEdits {
		result.Error = err.Error()
		return result
	}
	if !s.inRoot(target.Path) {
		return fail(errors.New("the file is outside the open folder"))
	}

	text, isUnsaved := s.unsaved[filepath.Clean(target.Path)]
	if !isUnsaved {
		data, ok := readTextFile(target.Path)
		if !ok {
			return fail(errors.New("cannot read the file as text"))
		}
		text = string(data)
	}

	lines := strings.Split(text, "\n")
	byLine := map[int][]Position{}
	for _, p := range target.Matches {
		byLine[p.Line] = append(byLine[p.Line], p)
	}

	for number, wanted := range byLine {
		if number < 1 || number > len(lines) {
			result.Skipped += len(wanted)
			continue
		}
		line := strings.TrimSuffix(lines[number-1], "\r")
		current := s.matcher.findReplaceable(line, s.opts.Regex)
		for _, p := range wanted {
			var hit *found
			for i := range current {
				c := &current[i]
				if utf16Len(line[:c.start])+1 == p.Column && utf16Len(line[c.start:c.end]) == p.Length {
					hit = c
					break
				}
			}
			if hit == nil {
				result.Skipped++
				continue
			}
			result.Edits = append(result.Edits, Edit{
				Line: p.Line, Column: p.Column, Length: p.Length, Text: hit.expand(replacement),
			})
		}
	}
	sort.Slice(result.Edits, func(i, j int) bool {
		a, b := result.Edits[i], result.Edits[j]
		if a.Line != b.Line {
			return a.Line < b.Line
		}
		return a.Column < b.Column
	})
	// The same position asked for twice must not be replaced twice.
	deduped := result.Edits[:0]
	for _, e := range result.Edits {
		if n := len(deduped); n > 0 && deduped[n-1].Line == e.Line && deduped[n-1].Column == e.Column {
			continue
		}
		deduped = append(deduped, e)
	}
	result.Edits = deduped

	if isUnsaved || len(result.Edits) == 0 {
		return result
	}
	updated, err := applyEdits(text, result.Edits)
	if err != nil {
		return fail(err)
	}
	if err := writeFileKeepingMode(target.Path, []byte(updated)); err != nil {
		return fail(fmt.Errorf("cannot write the file: %w", err))
	}
	result.Written = true
	return result
}

// applyEdits applies edits (sorted, non-overlapping, positions relative to the
// original text) to text.
func applyEdits(text string, edits []Edit) (string, error) {
	lines := strings.Split(text, "\n")
	for i := len(edits) - 1; i >= 0; i-- { // later columns first, so earlier ones stay valid
		e := edits[i]
		if e.Line < 1 || e.Line > len(lines) {
			return "", errors.New("edit is outside the file")
		}
		line := lines[e.Line-1]
		start, ok1 := byteOffset(line, e.Column-1)
		end, ok2 := byteOffset(line, e.Column-1+e.Length)
		if !ok1 || !ok2 || end < start {
			return "", errors.New("edit does not fit its line")
		}
		if i+1 < len(edits) && edits[i+1].Line == e.Line && edits[i+1].Column < e.Column+e.Length {
			return "", errors.New("edits overlap")
		}
		lines[e.Line-1] = line[:start] + e.Text + line[end:]
	}
	return strings.Join(lines, "\n"), nil
}

// byteOffset converts a UTF-16 offset in s to a byte offset.
func byteOffset(s string, units int) (int, bool) {
	n := 0
	for i, r := range s {
		if n == units {
			return i, true
		}
		if n > units {
			return 0, false // inside a surrogate pair
		}
		if r >= 0x10000 {
			n += 2
		} else {
			n++
		}
	}
	return len(s), n == units
}

// writeFileKeepingMode replaces a file's content through a temporary file, so
// a failure half way never leaves it truncated.
func writeFileKeepingMode(path string, data []byte) error {
	info, err := os.Stat(path)
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".daad-replace-*")
	if err != nil {
		return err
	}
	name := tmp.Name()
	_, werr := tmp.Write(data)
	cerr := tmp.Close()
	if werr != nil || cerr != nil {
		os.Remove(name)
		if werr != nil {
			return werr
		}
		return cerr
	}
	if err := os.Chmod(name, info.Mode().Perm()); err != nil {
		os.Remove(name)
		return err
	}
	if err := os.Rename(name, path); err != nil {
		os.Remove(name)
		return err
	}
	return nil
}
