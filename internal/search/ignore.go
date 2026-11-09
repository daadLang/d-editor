package search

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
)

// Folders that are never worth searching.
var skippedDirs = map[string]bool{
	".git":         true,
	".hg":          true,
	".svn":         true,
	"node_modules": true,
}

type ignoreRule struct {
	glob    glob
	negate  bool
	dirOnly bool
}

// ignoreList is a small subset of .gitignore: comments, `!` negation, a
// trailing `/` for folders, anchoring by a slash, `*`, `?`, `[..]` and `**`.
// Only the .gitignore at the search root is read.
type ignoreList []ignoreRule

func loadIgnoreFile(root string) ignoreList {
	file, err := os.Open(filepath.Join(root, ".gitignore"))
	if err != nil {
		return nil
	}
	defer file.Close()

	var rules ignoreList
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimRight(scanner.Text(), " \t\r")
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		rule := ignoreRule{}
		if strings.HasPrefix(line, "!") {
			rule.negate = true
			line = line[1:]
		}
		if strings.HasSuffix(line, "/") {
			rule.dirOnly = true
		}
		// A leading slash anchors the pattern; compileGlob would treat
		// "/build" as the unanchored name "build", so mark it explicitly.
		leadingSlash := strings.HasPrefix(line, "/")
		g, ok := compileGlob(line)
		if !ok {
			continue
		}
		if leadingSlash {
			g.anchored = true
		}
		rule.glob = g
		rules = append(rules, rule)
	}
	return rules
}

// ignored reports whether the entry at rel is ignored. The last matching rule
// wins, as in git. Parents are pruned by the walk, so only the entry itself is
// tested.
func (l ignoreList) ignored(rel string, isDir bool) bool {
	result := false
	for _, rule := range l {
		if rule.dirOnly && !isDir {
			continue
		}
		if rule.glob.matches(rel) {
			result = !rule.negate
		}
	}
	return result
}
