package search

import (
	"path"
	"strings"
)

// Globs follow the familiar VS Code / .gitignore flavour:
//
//   - `*` and `?` stay inside one path segment, `[abc]` is a character class
//   - `**` matches any number of segments (including none)
//   - `{a,b}` expands to alternatives
//   - a pattern without a slash matches a file or folder name at any depth
//   - a pattern with a slash is anchored at the search root
//
// Paths are always slash-separated and relative to the search root.

// expandBraces turns "a.{go,ts}" into ["a.go", "a.ts"]. Nested braces work.
func expandBraces(pattern string) []string {
	open := strings.IndexByte(pattern, '{')
	if open < 0 {
		return []string{pattern}
	}
	depth, closeAt := 0, -1
	for i := open; i < len(pattern); i++ {
		switch pattern[i] {
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				closeAt = i
			}
		}
		if closeAt >= 0 {
			break
		}
	}
	if closeAt < 0 {
		return []string{pattern} // unbalanced: treat literally
	}
	prefix, suffix := pattern[:open], pattern[closeAt+1:]
	var parts []string
	depth, start := 0, open+1
	for i := open + 1; i < closeAt; i++ {
		switch pattern[i] {
		case '{':
			depth++
		case '}':
			depth--
		case ',':
			if depth == 0 {
				parts = append(parts, pattern[start:i])
				start = i + 1
			}
		}
	}
	parts = append(parts, pattern[start:closeAt])

	var out []string
	for _, part := range parts {
		out = append(out, expandBraces(prefix+part+suffix)...)
	}
	return out
}

// matchSegments matches pattern segments against path segments.
func matchSegments(pat, name []string) bool {
	for len(pat) > 0 {
		if pat[0] == "**" {
			rest := pat[1:]
			if len(rest) == 0 {
				return true
			}
			for i := 0; i <= len(name); i++ {
				if matchSegments(rest, name[i:]) {
					return true
				}
			}
			return false
		}
		if len(name) == 0 {
			return false
		}
		ok, err := path.Match(pat[0], name[0])
		if err != nil || !ok {
			return false
		}
		pat, name = pat[1:], name[1:]
	}
	return len(name) == 0
}

// glob is one compiled pattern.
type glob struct {
	segments []string
	anchored bool // had a slash: must match from the root
}

func compileGlob(pattern string) (glob, bool) {
	pattern = strings.TrimSpace(strings.ReplaceAll(pattern, "\\", "/"))
	pattern = strings.TrimPrefix(pattern, "./")
	if pattern == "" {
		return glob{}, false
	}
	anchored := strings.Contains(strings.TrimSuffix(pattern, "/"), "/")
	pattern = strings.Trim(pattern, "/")
	if pattern == "" {
		return glob{}, false
	}
	return glob{segments: strings.Split(pattern, "/"), anchored: anchored}, true
}

// matches reports whether the glob matches rel itself (not its parents).
func (g glob) matches(rel string) bool {
	parts := strings.Split(rel, "/")
	if g.anchored {
		return matchSegments(g.segments, parts)
	}
	// Unanchored: the pattern is one name, tried against every segment so that
	// "node_modules" or "*.log" also hit things deeper in the tree.
	return matchSegments([]string{"**", g.segments[0]}, parts)
}

// globSet is a comma-separated list of patterns, e.g. "*.daad, src/**".
type globSet []glob

func parseGlobSet(list string) globSet {
	var set globSet
	for _, item := range splitList(list) {
		for _, expanded := range expandBraces(item) {
			if g, ok := compileGlob(expanded); ok {
				set = append(set, g)
			}
		}
	}
	return set
}

// splitList splits on commas that are not inside braces.
func splitList(list string) []string {
	var items []string
	depth, start := 0, 0
	for i := 0; i < len(list); i++ {
		switch list[i] {
		case '{':
			depth++
		case '}':
			if depth > 0 {
				depth--
			}
		case ',':
			if depth == 0 {
				items = append(items, list[start:i])
				start = i + 1
			}
		}
	}
	items = append(items, list[start:])
	var out []string
	for _, item := range items {
		if item = strings.TrimSpace(item); item != "" {
			out = append(out, item)
		}
	}
	return out
}

// matchesPathOrParent reports whether rel, or any folder above it, matches.
// A pattern such as "build" therefore excludes everything inside build/.
func (s globSet) matchesPathOrParent(rel string) bool {
	if len(s) == 0 {
		return false
	}
	parts := strings.Split(rel, "/")
	for i := 1; i <= len(parts); i++ {
		sub := strings.Join(parts[:i], "/")
		for _, g := range s {
			if g.matches(sub) {
				return true
			}
		}
	}
	return false
}

// matchesFile is the include test: only the file's own path counts, but a
// folder pattern ("src") also admits the files below it.
func (s globSet) matchesFile(rel string) bool {
	return s.matchesPathOrParent(rel)
}
