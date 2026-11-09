// Package search implements "find in files" for the IDE: a concurrent walk of
// the open folder that streams matches in batches and can be cancelled.
//
// It is plain Go with no Wails dependency, so it can be tested on its own.
// All columns and lengths it reports are in UTF-16 code units, because that is
// how JavaScript (and so CodeMirror and the UI) indexes strings. Arabic text is
// multi-byte in UTF-8, so byte offsets would land in the wrong place.
package search

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"
)

const (
	defaultMaxResults = 2000
	maxFileSize       = 2 << 20 // bigger files are skipped
	maxMatchesPerFile = 1000
	binarySniffBytes  = 8000
	previewRunes      = 200
	previewLead       = 30
	batchFiles        = 25
	batchInterval     = 80 * time.Millisecond
)

// Options describe one search. The JSON names are what the frontend sends.
type Options struct {
	// ID lets the caller know which events belong to this search before
	// Start returns. Generated when empty.
	ID   string `json:"id"`
	Root string `json:"root"`

	Query         string `json:"query"`
	CaseSensitive bool   `json:"caseSensitive"`
	WholeWord     bool   `json:"wholeWord"`
	Regex         bool   `json:"regex"`
	// IgnoreDiacritics treats Arabic tashkeel and tatweel as absent and folds
	// the alef and yaa variants, so "كتب" finds "كَتَبَ" and "أحمد" finds "احمد".
	IgnoreDiacritics bool `json:"ignoreDiacritics"`

	// Include and Exclude are comma-separated globs, e.g. "*.daad, src/**".
	Include string `json:"include"`
	Exclude string `json:"exclude"`

	MaxResults int `json:"maxResults"`

	// Unsaved holds the text of open files that have edits not yet on disk.
	// Those files are searched from this text instead of from disk.
	Unsaved map[string]string `json:"unsaved"`
}

// Match is one hit on one line.
type Match struct {
	Line   int `json:"line"`   // 1-based
	Column int `json:"column"` // 1-based, UTF-16 units
	Length int `json:"length"` // UTF-16 units
	// Preview is the line, without leading whitespace and shortened around the
	// match; PreviewStart is where the match begins inside it (UTF-16 units).
	Preview      string `json:"preview"`
	PreviewStart int    `json:"previewStart"`
}

// FileResult groups the matches found in one file.
type FileResult struct {
	Path    string  `json:"path"`
	Matches []Match `json:"matches"`
}

// Summary is reported when a search ends.
type Summary struct {
	Files      int   `json:"files"`
	Matches    int   `json:"matches"`
	Truncated  bool  `json:"truncated"` // stopped at MaxResults
	Cancelled  bool  `json:"cancelled"`
	DurationMs int64 `json:"durationMs"`
}

// Search is a validated, ready-to-run search.
type Search struct {
	opts    Options
	root    string
	matcher *matcher
	include globSet
	exclude globSet
	ignore  ignoreList
	unsaved map[string]string
}

// New validates the options. Invalid regular expressions and a missing root
// are reported here, before anything runs.
func New(opts Options) (*Search, error) {
	if opts.Root == "" {
		return nil, errors.New("no folder is open")
	}
	root := filepath.Clean(opts.Root)
	info, err := os.Stat(root)
	if err != nil {
		return nil, fmt.Errorf("cannot read folder: %w", err)
	}
	if !info.IsDir() {
		return nil, errors.New("search root is not a folder")
	}
	m, err := newMatcher(opts)
	if err != nil {
		return nil, err
	}
	if opts.MaxResults <= 0 {
		opts.MaxResults = defaultMaxResults
	}
	unsaved := make(map[string]string, len(opts.Unsaved))
	for path, text := range opts.Unsaved {
		unsaved[filepath.Clean(path)] = text
	}
	return &Search{
		opts:    opts,
		root:    root,
		matcher: m,
		include: parseGlobSet(opts.Include),
		exclude: parseGlobSet(opts.Exclude),
		ignore:  loadIgnoreFile(root),
		unsaved: unsaved,
	}, nil
}

// Run walks the folder and calls emit with batches of results until the search
// is finished, cancelled through ctx, or MaxResults is reached. emit is only
// ever called from the goroutine that called Run.
func (s *Search) Run(ctx context.Context, emit func([]FileResult)) Summary {
	started := time.Now()
	runCtx, stop := context.WithCancel(ctx)
	defer stop()

	paths := make(chan string, 256)
	results := make(chan FileResult, 64)

	go func() {
		defer close(paths)
		s.walk(runCtx, paths)
	}()

	var workers sync.WaitGroup
	for i := 0; i < runtime.NumCPU(); i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for path := range paths {
				if runCtx.Err() != nil {
					continue // keep draining so the walker can finish
				}
				if result, ok := s.searchFile(path); ok {
					select {
					case results <- result:
					case <-runCtx.Done():
					}
				}
			}
		}()
	}
	go func() {
		workers.Wait()
		close(results)
	}()

	var summary Summary
	var batch []FileResult
	flush := func() {
		if len(batch) > 0 {
			emit(batch)
			batch = nil
		}
	}
	ticker := time.NewTicker(batchInterval)
	defer ticker.Stop()

collect:
	for {
		select {
		case result, ok := <-results:
			if !ok {
				break collect
			}
			if summary.Truncated {
				continue
			}
			room := s.opts.MaxResults - summary.Matches
			if len(result.Matches) >= room {
				result.Matches = result.Matches[:room]
				summary.Truncated = true
				stop() // enough; let the walk wind down
			}
			if len(result.Matches) == 0 {
				continue
			}
			summary.Files++
			summary.Matches += len(result.Matches)
			batch = append(batch, result)
			if len(batch) >= batchFiles {
				flush()
			}
		case <-ticker.C:
			flush()
		}
	}
	flush()

	summary.Cancelled = ctx.Err() != nil
	summary.DurationMs = time.Since(started).Milliseconds()
	return summary
}

func (s *Search) walk(ctx context.Context, out chan<- string) {
	_ = filepath.WalkDir(s.root, func(path string, d fs.DirEntry, err error) error {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err != nil {
			if d != nil && d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		if path == s.root {
			return nil
		}
		rel, relErr := filepath.Rel(s.root, path)
		if relErr != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)

		if d.IsDir() {
			if skippedDirs[d.Name()] || s.exclude.matchesPathOrParent(rel) || s.ignore.ignored(rel, true) {
				return fs.SkipDir
			}
			return nil
		}
		if !d.Type().IsRegular() { // symlinks and devices: skipped on purpose
			return nil
		}
		if s.exclude.matchesPathOrParent(rel) || s.ignore.ignored(rel, false) {
			return nil
		}
		if len(s.include) > 0 && !s.include.matchesFile(rel) {
			return nil
		}
		select {
		case out <- path:
		case <-ctx.Done():
			return ctx.Err()
		}
		return nil
	})
}

// searchFile returns the matches in one file; ok is false when there are none
// or the file is unreadable, too big, or binary.
func (s *Search) searchFile(path string) (FileResult, bool) {
	var text string
	if unsaved, ok := s.unsaved[filepath.Clean(path)]; ok {
		text = unsaved
	} else {
		data, ok := readTextFile(path)
		if !ok {
			return FileResult{}, false
		}
		text = string(data)
	}

	var matches []Match
	for index, line := range strings.Split(text, "\n") {
		line = strings.TrimSuffix(line, "\r")
		for _, span := range s.matcher.find(line) {
			matches = append(matches, newMatch(index+1, line, span[0], span[1]))
			if len(matches) >= maxMatchesPerFile {
				return FileResult{Path: path, Matches: matches}, true
			}
		}
	}
	if len(matches) == 0 {
		return FileResult{}, false
	}
	return FileResult{Path: path, Matches: matches}, true
}

func readTextFile(path string) ([]byte, bool) {
	info, err := os.Stat(path)
	if err != nil || info.Size() > maxFileSize {
		return nil, false
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, false
	}
	sniff := data
	if len(sniff) > binarySniffBytes {
		sniff = sniff[:binarySniffBytes]
	}
	if bytes.IndexByte(sniff, 0) >= 0 {
		return nil, false
	}
	return data, true
}

// --- matching -------------------------------------------------------------

type matcher struct {
	re        *regexp.Regexp
	wholeWord bool
	fold      bool
}

func newMatcher(opts Options) (*matcher, error) {
	if opts.Query == "" {
		return nil, errors.New("empty query")
	}
	query := opts.Query
	if opts.IgnoreDiacritics {
		query, _ = foldArabic(query)
	}
	if !opts.Regex {
		query = regexp.QuoteMeta(query)
	}
	if !opts.CaseSensitive {
		query = "(?i)" + query
	}
	re, err := regexp.Compile(query)
	if err != nil {
		return nil, fmt.Errorf("invalid regular expression: %w", err)
	}
	return &matcher{re: re, wholeWord: opts.WholeWord, fold: opts.IgnoreDiacritics}, nil
}

// find returns the [start, end) byte spans of the matches in a line, as
// offsets into the original (unfolded) line.
func (m *matcher) find(line string) [][2]int {
	text, offsets := line, []int(nil)
	if m.fold {
		text, offsets = foldArabic(line)
	}
	var spans [][2]int
	for _, loc := range m.re.FindAllStringIndex(text, -1) {
		start, end := loc[0], loc[1]
		if end == start {
			continue // an empty match is never useful to show
		}
		if m.wholeWord && !wordBounded(text, start, end) {
			continue
		}
		if offsets != nil {
			start, end = offsets[start], offsets[end]
		}
		spans = append(spans, [2]int{start, end})
	}
	return spans
}

// found is one match with a way to build its replacement text.
type found struct {
	start, end int // byte offsets into the original line
	expand     func(replacement string) string
}

// findReplaceable is find, plus what is needed to replace each match: in regex
// mode "$1", "${name}" and "$$" in the replacement are expanded from the
// match's groups; otherwise the replacement is used as written.
func (m *matcher) findReplaceable(line string, regexMode bool) []found {
	text, offsets := line, []int(nil)
	if m.fold {
		text, offsets = foldArabic(line)
	}
	var out []found
	for _, loc := range m.re.FindAllStringSubmatchIndex(text, -1) {
		start, end := loc[0], loc[1]
		if end == start {
			continue
		}
		if m.wholeWord && !wordBounded(text, start, end) {
			continue
		}
		loc := loc
		expand := func(replacement string) string { return replacement }
		if regexMode {
			expand = func(replacement string) string {
				return string(m.re.ExpandString(nil, replacement, text, loc))
			}
		}
		if offsets != nil {
			start, end = offsets[start], offsets[end]
		}
		out = append(out, found{start, end, expand})
	}
	return out
}

func isWordRune(r rune) bool {
	return r == '_' || unicode.IsLetter(r) || unicode.IsDigit(r) || unicode.IsMark(r)
}

// wordBounded is a Unicode-aware \b: Go's own \b only knows ASCII letters, so
// it would call every Arabic word "not a word".
func wordBounded(text string, start, end int) bool {
	if start > 0 {
		if r, _ := utf8.DecodeLastRuneInString(text[:start]); isWordRune(r) {
			return false
		}
	}
	if end < len(text) {
		if r, _ := utf8.DecodeRuneInString(text[end:]); isWordRune(r) {
			return false
		}
	}
	return true
}

// foldRune maps a rune for diacritic-insensitive matching; keep is false for
// runes that are dropped altogether.
func foldRune(r rune) (rune, bool) {
	switch {
	case r >= 0x064B && r <= 0x065F, // tashkeel
		r == 0x0670, // superscript alef
		r == 0x0640, // tatweel
		r >= 0x06D6 && r <= 0x06DC,
		r >= 0x06DF && r <= 0x06E4,
		r == 0x06E7, r == 0x06E8,
		r >= 0x06EA && r <= 0x06ED:
		return 0, false
	case r == 0x0622, r == 0x0623, r == 0x0625, r == 0x0671: // آ أ إ ٱ
		return 0x0627, true // ا
	case r == 0x0649: // ى
		return 0x064A, true // ي
	}
	return r, true
}

// foldArabic returns the folded text and, for every byte offset in it, the
// byte offset of the same place in the original. The final entry maps the end.
func foldArabic(s string) (string, []int) {
	var b strings.Builder
	b.Grow(len(s))
	offsets := make([]int, 0, len(s)+1)
	for i, r := range s {
		folded, keep := foldRune(r)
		if !keep {
			continue
		}
		before := b.Len()
		b.WriteRune(folded)
		for k := before; k < b.Len(); k++ {
			offsets = append(offsets, i)
		}
	}
	offsets = append(offsets, len(s))
	return b.String(), offsets
}

// --- results --------------------------------------------------------------

func utf16Len(s string) int {
	n := 0
	for _, r := range s {
		if r >= 0x10000 {
			n += 2
		} else {
			n++
		}
	}
	return n
}

func newMatch(lineNumber int, line string, start, end int) Match {
	preview, previewStart := makePreview(line, start, end)
	return Match{
		Line:         lineNumber,
		Column:       utf16Len(line[:start]) + 1,
		Length:       utf16Len(line[start:end]),
		Preview:      preview,
		PreviewStart: previewStart,
	}
}

// makePreview trims leading whitespace and, for very long lines, cuts a window
// around the match so the UI never has to render a minified file's one line.
func makePreview(line string, start, end int) (string, int) {
	trimmed := strings.TrimLeft(line, " \t")
	shift := len(line) - len(trimmed)
	start -= shift
	if start < 0 {
		start = 0
	}
	if utf8.RuneCountInString(trimmed) <= previewRunes {
		return trimmed, utf16Len(trimmed[:start])
	}

	runes := []rune(trimmed)
	matchRune := utf8.RuneCountInString(trimmed[:start])
	from := matchRune - previewLead
	if from < 0 {
		from = 0
	}
	to := from + previewRunes
	if to > len(runes) {
		to = len(runes)
	}
	prefix, suffix := "", ""
	if from > 0 {
		prefix = "…"
	}
	if to < len(runes) {
		suffix = "…"
	}
	preview := prefix + string(runes[from:to]) + suffix
	return preview, utf16Len(prefix) + utf16Len(string(runes[from:matchRune]))
}
