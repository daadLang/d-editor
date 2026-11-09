package search

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"
)

// tree writes files (relative path -> content) under a fresh temp folder.
func tree(t *testing.T, files map[string]string) string {
	t.Helper()
	root := t.TempDir()
	for rel, content := range files {
		full := filepath.Join(root, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return root
}

// run executes a search and returns results keyed by slash-relative path.
func run(t *testing.T, opts Options) (map[string][]Match, Summary) {
	t.Helper()
	s, err := New(opts)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	got := map[string][]Match{}
	summary := s.Run(context.Background(), func(batch []FileResult) {
		for _, f := range batch {
			rel, _ := filepath.Rel(filepath.Clean(opts.Root), f.Path)
			got[filepath.ToSlash(rel)] = f.Matches
		}
	})
	return got, summary
}

func keys(m map[string][]Match) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func TestLiteralCaseInsensitiveByDefault(t *testing.T) {
	root := tree(t, map[string]string{"a.txt": "Hello\nhello world\nnothing\n", "b.txt": "HELLO"})
	got, sum := run(t, Options{Root: root, Query: "hello"})
	if !reflect.DeepEqual(keys(got), []string{"a.txt", "b.txt"}) {
		t.Fatalf("files = %v", keys(got))
	}
	if len(got["a.txt"]) != 2 || got["a.txt"][1].Line != 2 {
		t.Fatalf("a.txt matches = %+v", got["a.txt"])
	}
	if sum.Files != 2 || sum.Matches != 3 {
		t.Fatalf("summary = %+v", sum)
	}
}

func TestCaseSensitive(t *testing.T) {
	root := tree(t, map[string]string{"a.txt": "Hello hello"})
	got, _ := run(t, Options{Root: root, Query: "hello", CaseSensitive: true})
	if len(got["a.txt"]) != 1 || got["a.txt"][0].Column != 7 {
		t.Fatalf("matches = %+v", got["a.txt"])
	}
}

func TestLiteralQueryIsNotARegex(t *testing.T) {
	root := tree(t, map[string]string{"a.txt": "a.c abc"})
	got, _ := run(t, Options{Root: root, Query: "a.c"})
	if len(got["a.txt"]) != 1 {
		t.Fatalf("'.' must be literal, got %+v", got["a.txt"])
	}
}

func TestRegex(t *testing.T) {
	root := tree(t, map[string]string{"a.txt": "id=42 id=7 id=x"})
	got, _ := run(t, Options{Root: root, Query: `id=\d+`, Regex: true})
	if len(got["a.txt"]) != 2 {
		t.Fatalf("matches = %+v", got["a.txt"])
	}
}

func TestInvalidRegexIsReportedUpFront(t *testing.T) {
	root := tree(t, nil)
	if _, err := New(Options{Root: root, Query: "(", Regex: true}); err == nil {
		t.Fatal("expected an error")
	}
	if _, err := New(Options{Root: root, Query: ""}); err == nil {
		t.Fatal("empty query must be rejected")
	}
	if _, err := New(Options{Root: filepath.Join(root, "nope"), Query: "x"}); err == nil {
		t.Fatal("missing root must be rejected")
	}
}

func TestWholeWordWorksForArabic(t *testing.T) {
	// Go's \b would fail here; the check must be Unicode-aware.
	root := tree(t, map[string]string{"a.daad": "اطبع(\"س\")\nسلام سلامة\nكتبت كتب"})
	got, _ := run(t, Options{Root: root, Query: "سلام", WholeWord: true})
	m := got["a.daad"]
	if len(m) != 1 || m[0].Line != 2 || m[0].Column != 1 {
		t.Fatalf("whole word 'سلام' should match once (not inside سلامة): %+v", m)
	}
	got, _ = run(t, Options{Root: root, Query: "كتب", WholeWord: true})
	if m := got["a.daad"]; len(m) != 1 || m[0].Column != 6 {
		t.Fatalf("matches = %+v", m)
	}
}

func TestColumnsAreUTF16NotBytes(t *testing.T) {
	// 4 Arabic letters (8 bytes) + space, then the match; plus an emoji
	// (surrogate pair in UTF-16) before a second match.
	root := tree(t, map[string]string{"a.txt": "مرحبا X\n😀 X"})
	got, _ := run(t, Options{Root: root, Query: "X", CaseSensitive: true})
	m := got["a.txt"]
	if len(m) != 2 {
		t.Fatalf("matches = %+v", m)
	}
	if m[0].Column != 7 { // "مرحبا " is 6 UTF-16 units
		t.Fatalf("arabic column = %d, want 7", m[0].Column)
	}
	if m[1].Column != 4 { // emoji = 2 units + space = 3
		t.Fatalf("emoji column = %d, want 4", m[1].Column)
	}
	if m[0].Length != 1 {
		t.Fatalf("length = %d", m[0].Length)
	}
}

func TestIgnoreDiacriticsAndAlefForms(t *testing.T) {
	root := tree(t, map[string]string{"a.txt": "كَتَبَ الطالبُ\nأحمد\nمستشفى"})
	got, _ := run(t, Options{Root: root, Query: "كتب", IgnoreDiacritics: true})
	m := got["a.txt"]
	if len(m) != 1 || m[0].Line != 1 || m[0].Column != 1 {
		t.Fatalf("diacritics: %+v", m)
	}
	// The highlighted span covers the whole vowelled word: 3 letters + 3 marks.
	if m[0].Length != 6 {
		t.Fatalf("length = %d, want 6 (letters and their marks)", m[0].Length)
	}
	got, _ = run(t, Options{Root: root, Query: "احمد", IgnoreDiacritics: true})
	if len(got["a.txt"]) != 1 || got["a.txt"][0].Line != 2 {
		t.Fatalf("alef: %+v", got["a.txt"])
	}
	got, _ = run(t, Options{Root: root, Query: "مستشفي", IgnoreDiacritics: true})
	if len(got["a.txt"]) != 1 {
		t.Fatalf("yaa/alef maqsura: %+v", got["a.txt"])
	}
	// Off by default: no match.
	got, _ = run(t, Options{Root: root, Query: "كتب"})
	if len(got["a.txt"]) != 0 {
		t.Fatalf("without the option, vowelled text must not match: %+v", got["a.txt"])
	}
}

func TestIgnoreDiacriticsFoldsTheQueryToo(t *testing.T) {
	root := tree(t, map[string]string{"a.txt": "كتب\nاحمد"})
	got, _ := run(t, Options{Root: root, Query: "كَتَبَ", IgnoreDiacritics: true})
	if len(got["a.txt"]) != 1 || got["a.txt"][0].Line != 1 {
		t.Fatalf("vowelled query must find plain text: %+v", got["a.txt"])
	}
	got, _ = run(t, Options{Root: root, Query: "أحمد", IgnoreDiacritics: true})
	if len(got["a.txt"]) != 1 || got["a.txt"][0].Line != 2 {
		t.Fatalf("hamza-alef query must find plain alef text: %+v", got["a.txt"])
	}
}

func TestSkipsBinaryLargeAndBuiltinFolders(t *testing.T) {
	root := tree(t, map[string]string{
		"ok.txt":                     "needle",
		"bin.dat":                    "needle\x00needle",
		"big.txt":                    strings.Repeat("needle\n", maxFileSize/7+10),
		"node_modules/pkg/index.js":  "needle",
		".git/config":                "needle",
		"src/.hidden-but-searchable": "needle",
	})
	got, _ := run(t, Options{Root: root, Query: "needle"})
	want := []string{"ok.txt", "src/.hidden-but-searchable"}
	if !reflect.DeepEqual(keys(got), want) {
		t.Fatalf("files = %v, want %v", keys(got), want)
	}
}

func TestIncludeAndExcludeGlobs(t *testing.T) {
	root := tree(t, map[string]string{
		"a.daad":          "x",
		"b.txt":           "x",
		"src/c.daad":      "x",
		"src/d.txt":       "x",
		"build/e.daad":    "x",
		"src/gen/f.daad":  "x",
		"tests/g.test.ts": "x",
	})
	got, _ := run(t, Options{Root: root, Query: "x", Include: "*.daad"})
	if want := []string{"a.daad", "build/e.daad", "src/c.daad", "src/gen/f.daad"}; !reflect.DeepEqual(keys(got), want) {
		t.Fatalf("include *.daad: %v", keys(got))
	}
	got, _ = run(t, Options{Root: root, Query: "x", Include: "*.daad", Exclude: "build, src/gen"})
	if want := []string{"a.daad", "src/c.daad"}; !reflect.DeepEqual(keys(got), want) {
		t.Fatalf("exclude folders: %v", keys(got))
	}
	got, _ = run(t, Options{Root: root, Query: "x", Include: "src/**"})
	if want := []string{"src/c.daad", "src/d.txt", "src/gen/f.daad"}; !reflect.DeepEqual(keys(got), want) {
		t.Fatalf("include src/**: %v", keys(got))
	}
	got, _ = run(t, Options{Root: root, Query: "x", Include: "*.{txt,ts}"})
	if want := []string{"b.txt", "src/d.txt", "tests/g.test.ts"}; !reflect.DeepEqual(keys(got), want) {
		t.Fatalf("braces: %v", keys(got))
	}
	got, _ = run(t, Options{Root: root, Query: "x", Exclude: "**/*.test.*"})
	if _, found := got["tests/g.test.ts"]; found {
		t.Fatalf("exclude **/*.test.* should drop it: %v", keys(got))
	}
}

func TestGitignoreSubset(t *testing.T) {
	root := tree(t, map[string]string{
		".gitignore":      "# comment\n*.log\n/dist/\nout\n!keep.log\n",
		"a.log":           "x",
		"keep.log":        "x",
		"dist/app.js":     "x",
		"src/dist/app.js": "x", // /dist/ is anchored: only the root one
		"out/z.txt":       "x",
		"sub/out":         "x", // 'out' matches a file named out at any depth
		"main.daad":       "x",
	})
	got, _ := run(t, Options{Root: root, Query: "x"})
	// ".gitignore" itself contains no 'x', so it is not a hit.
	want := []string{"keep.log", "main.daad", "src/dist/app.js"}
	if !reflect.DeepEqual(keys(got), want) {
		t.Fatalf("files = %v, want %v", keys(got), want)
	}
}

func TestUnsavedTextWinsOverDisk(t *testing.T) {
	root := tree(t, map[string]string{"a.txt": "on disk: alpha", "b.txt": "beta"})
	got, _ := run(t, Options{
		Root:    root,
		Query:   "gamma",
		Unsaved: map[string]string{filepath.Join(root, "a.txt"): "typed but not saved: gamma"},
	})
	if len(got["a.txt"]) != 1 {
		t.Fatalf("unsaved text must be searched: %v", keys(got))
	}
	got, _ = run(t, Options{
		Root:    root,
		Query:   "alpha",
		Unsaved: map[string]string{filepath.Join(root, "a.txt"): "now it says something else"},
	})
	if len(got) != 0 {
		t.Fatalf("stale disk text must not match: %v", keys(got))
	}
}

func TestCRLFAndPreview(t *testing.T) {
	root := tree(t, map[string]string{"a.txt": "\tindented needle here\r\nsecond\r\n"})
	got, _ := run(t, Options{Root: root, Query: "needle"})
	m := got["a.txt"][0]
	if m.Preview != "indented needle here" {
		t.Fatalf("preview = %q", m.Preview)
	}
	if m.PreviewStart != 9 || m.Length != 6 {
		t.Fatalf("previewStart=%d length=%d", m.PreviewStart, m.Length)
	}
	if m.Column != 11 { // tab + "indented " = 10 units
		t.Fatalf("column = %d", m.Column)
	}
}

func TestLongLinesGetAWindowedPreview(t *testing.T) {
	line := strings.Repeat("ب", 500) + "NEEDLE" + strings.Repeat("ت", 500)
	root := tree(t, map[string]string{"min.js": line})
	got, _ := run(t, Options{Root: root, Query: "needle"})
	m := got["min.js"][0]
	if utf16Len(m.Preview) > previewRunes+4 {
		t.Fatalf("preview too long: %d", utf16Len(m.Preview))
	}
	units := []rune(m.Preview)
	// The window must still contain the match at PreviewStart.
	var before int
	for i, r := range units {
		if before == m.PreviewStart {
			if string(units[i:i+m.Length]) != "NEEDLE" {
				t.Fatalf("window misaligned: %q", string(units[i:i+m.Length]))
			}
			break
		}
		before++
		_ = r
	}
	if m.Column != 501 {
		t.Fatalf("column still refers to the real line: %d", m.Column)
	}
}

func TestMaxResultsTruncates(t *testing.T) {
	files := map[string]string{}
	for i := 0; i < 20; i++ {
		files[filepath.Join("d", string(rune('a'+i))+".txt")] = strings.Repeat("hit\n", 10)
	}
	root := tree(t, files)
	got, sum := run(t, Options{Root: root, Query: "hit", MaxResults: 55})
	total := 0
	for _, m := range got {
		total += len(m)
	}
	if total != 55 || sum.Matches != 55 || !sum.Truncated {
		t.Fatalf("total=%d summary=%+v", total, sum)
	}
}

func TestCancelStopsTheSearch(t *testing.T) {
	files := map[string]string{}
	for i := 0; i < 400; i++ {
		files[filepath.Join("d", strings.Repeat("x", i%7+1), string(rune('a'+i%26))+string(rune('a'+i/26))+".txt")] = "needle\n"
	}
	root := tree(t, files)
	s, err := New(Options{Root: root, Query: "needle"})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancelled before it starts
	var n int
	sum := s.Run(ctx, func(b []FileResult) { n += len(b) })
	if !sum.Cancelled {
		t.Fatalf("summary = %+v", sum)
	}
	if n >= 400 {
		t.Fatalf("a cancelled search must not finish the whole tree (%d)", n)
	}
}

func TestManagerStreamsAndFinishes(t *testing.T) {
	root := tree(t, map[string]string{"a.txt": "hit", "b.txt": "hit"})
	m := NewManager()
	var mu sync.Mutex
	var events []Event
	done := make(chan struct{})
	id, err := m.Start(Options{ID: "fixed-id", Root: root, Query: "hit"}, func(e Event) {
		mu.Lock()
		events = append(events, e)
		mu.Unlock()
		if e.Done {
			close(done)
		}
	})
	if err != nil || id != "fixed-id" {
		t.Fatalf("id=%q err=%v", id, err)
	}
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("search did not finish")
	}
	mu.Lock()
	defer mu.Unlock()
	files := 0
	for _, e := range events {
		if e.ID != "fixed-id" {
			t.Fatalf("event has the wrong id: %+v", e)
		}
		files += len(e.Files)
	}
	last := events[len(events)-1]
	if files != 2 || !last.Done || last.Summary == nil || last.Summary.Matches != 2 {
		t.Fatalf("files=%d last=%+v", files, last)
	}
	// The ID is free again once finished.
	time.Sleep(20 * time.Millisecond)
	m.mu.Lock()
	left := len(m.running)
	m.mu.Unlock()
	if left != 0 {
		t.Fatalf("%d searches still registered", left)
	}
}

func TestManagerRejectsBadOptionsSynchronously(t *testing.T) {
	m := NewManager()
	if _, err := m.Start(Options{Root: t.TempDir(), Query: "(", Regex: true}, func(Event) {}); err == nil {
		t.Fatal("expected a synchronous error for a bad regex")
	}
}

func TestExpandBraces(t *testing.T) {
	cases := map[string][]string{
		"a":           {"a"},
		"*.{go,ts}":   {"*.go", "*.ts"},
		"{a,b}/{c,d}": {"a/c", "a/d", "b/c", "b/d"},
		"x.{a,{b,c}}": {"x.a", "x.b", "x.c"},
		"{unbalanced": {"{unbalanced"},
	}
	for in, want := range cases {
		got := expandBraces(in)
		sort.Strings(got)
		sort.Strings(want)
		if !reflect.DeepEqual(got, want) {
			t.Errorf("expandBraces(%q) = %v, want %v", in, got, want)
		}
	}
}

// --- replace ----------------------------------------------------------------

func replaceAll(t *testing.T, dir string, opts Options, repl string) []FileEdits {
	t.Helper()
	opts.Root = dir
	s, err := New(opts)
	if err != nil {
		t.Fatal(err)
	}
	var targets []Target
	s.Run(context.Background(), func(files []FileResult) {
		for _, f := range files {
			target := Target{Path: f.Path}
			for _, m := range f.Matches {
				target.Matches = append(target.Matches, Position{m.Line, m.Column, m.Length})
			}
			targets = append(targets, target)
		}
	})
	out, err := Replace(opts, repl, targets)
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func TestReplaceWritesFilesAndHandlesArabicAndSurrogates(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "a.txt")
	os.WriteFile(path, []byte("😀 اطبع(x) اطبع(y)\r\nلا شيء\nاطبع\n"), 0o640)

	out := replaceAll(t, dir, Options{Query: "اطبع"}, "اكتب")
	if len(out) != 1 || !out[0].Written || len(out[0].Edits) != 3 || out[0].Skipped != 0 {
		t.Fatalf("unexpected result: %+v", out)
	}
	got, _ := os.ReadFile(path)
	if want := "😀 اكتب(x) اكتب(y)\r\nلا شيء\nاكتب\n"; string(got) != want {
		t.Fatalf("got %q want %q", got, want)
	}
	if info, _ := os.Stat(path); info.Mode().Perm() != 0o640 {
		t.Fatalf("mode changed: %v", info.Mode())
	}
}

func TestReplaceRegexExpandsGroupsButLiteralDoesNot(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "a.txt")
	os.WriteFile(path, []byte("a1 b2\n"), 0o644)
	replaceAll(t, dir, Options{Query: `([a-z])(\d)`, Regex: true}, "$2$1")
	if got, _ := os.ReadFile(path); string(got) != "1a 2b\n" {
		t.Fatalf("regex: %q", got)
	}

	os.WriteFile(path, []byte("cost $1 here\n"), 0o644)
	replaceAll(t, dir, Options{Query: "$1"}, "$2")
	if got, _ := os.ReadFile(path); string(got) != "cost $2 here\n" {
		t.Fatalf("literal: %q", got)
	}
}

func TestReplaceSkipsStaleMatchesAndLeavesFileUntouched(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "a.txt")
	os.WriteFile(path, []byte("foo bar\n"), 0o644)
	opts := Options{Root: dir, Query: "foo"}
	// The results were for an older version of the file.
	out, err := Replace(opts, "X", []Target{{Path: path, Matches: []Position{{1, 5, 3}, {9, 1, 3}}}})
	if err != nil || out[0].Skipped != 2 || out[0].Written {
		t.Fatalf("%+v %v", out, err)
	}
	if got, _ := os.ReadFile(path); string(got) != "foo bar\n" {
		t.Fatalf("file changed: %q", got)
	}
}

func TestReplaceUnsavedIsNotWrittenAndRefusesOutsideRoot(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "a.txt")
	os.WriteFile(path, []byte("old\n"), 0o644)
	outside := filepath.Join(t.TempDir(), "b.txt")
	os.WriteFile(outside, []byte("foo\n"), 0o644)

	opts := Options{Root: dir, Query: "foo", Unsaved: map[string]string{path: "x foo\n"}}
	out, err := Replace(opts, "bar", []Target{
		{Path: path, Matches: []Position{{1, 3, 3}}},
		{Path: outside, Matches: []Position{{1, 1, 3}}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if out[0].Written || len(out[0].Edits) != 1 || out[0].Edits[0].Text != "bar" {
		t.Fatalf("unsaved: %+v", out[0])
	}
	if got, _ := os.ReadFile(path); string(got) != "old\n" {
		t.Fatalf("disk was written: %q", got)
	}
	if out[1].Error == "" {
		t.Fatalf("outside root accepted: %+v", out[1])
	}
	if got, _ := os.ReadFile(outside); string(got) != "foo\n" {
		t.Fatalf("outside file changed: %q", got)
	}
}

func TestReplaceDuplicatePositionAppliedOnce(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "a.txt")
	os.WriteFile(path, []byte("foo\n"), 0o644)
	out, _ := Replace(Options{Root: dir, Query: "foo"}, "foofoo", []Target{{Path: path, Matches: []Position{{1, 1, 3}, {1, 1, 3}}}})
	if len(out[0].Edits) != 1 {
		t.Fatalf("%+v", out[0])
	}
	if got, _ := os.ReadFile(path); string(got) != "foofoo\n" {
		t.Fatalf("%q", got)
	}
}

func TestReplaceSeveralOnOneLineWithDifferentLength(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "a.txt")
	os.WriteFile(path, []byte("😀 ab ab ab\n"), 0o644)
	replaceAll(t, dir, Options{Query: "ab"}, "longer")
	if got, _ := os.ReadFile(path); string(got) != "😀 longer longer longer\n" {
		t.Fatalf("%q", got)
	}
	replaceAll(t, dir, Options{Query: "longer"}, "")
	if got, _ := os.ReadFile(path); string(got) != "😀   \n" {
		t.Fatalf("%q", got)
	}
}
