package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx       context.Context
	process   *exec.Cmd
	stdin     io.WriteCloser
	processMu sync.Mutex
}

type FileEntry struct {
	Name        string `json:"name"`
	Path        string `json:"path"`
	IsDirectory bool   `json:"isDirectory"`
}

func NewApp() *App { return &App{} }

func (a *App) startup(ctx context.Context) { a.ctx = ctx }

func (a *App) ReadDirectory(dirPath string) ([]FileEntry, error) {
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read directory: %w", err)
	}
	result := make([]FileEntry, 0, len(entries))
	for _, entry := range entries {
		result = append(result, FileEntry{Name: entry.Name(), Path: filepath.Join(dirPath, entry.Name()), IsDirectory: entry.IsDir()})
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].IsDirectory != result[j].IsDirectory {
			return result[i].IsDirectory
		}
		return result[i].Name < result[j].Name
	})
	return result, nil
}

func (a *App) ReadFile(filePath string) (string, error) {
	content, err := os.ReadFile(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to read file: %w", err)
	}
	return string(content), nil
}

func (a *App) WriteFile(filePath, content string) error {
	if err := os.WriteFile(filePath, []byte(content), 0644); err != nil {
		return fmt.Errorf("failed to write file: %w", err)
	}
	return nil
}

func (a *App) CreateFile(filePath string) error {
	file, err := os.OpenFile(filePath, os.O_CREATE|os.O_EXCL, 0644)
	if err != nil {
		return fmt.Errorf("failed to create file: %w", err)
	}
	return file.Close()
}

func (a *App) DeletePath(targetPath string) error {
	if err := os.RemoveAll(targetPath); err != nil {
		return fmt.Errorf("failed to delete: %w", err)
	}
	return nil
}

func (a *App) RenamePath(oldPath, newPath string) error {
	if err := os.Rename(oldPath, newPath); err != nil {
		return fmt.Errorf("failed to rename: %w", err)
	}
	return nil
}

func (a *App) OpenFolderDialog() (string, error) {
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{Title: "Open folder"})
}

func (a *App) SelectProjectPath() (string, error) { return a.OpenFolderDialog() }

func (a *App) CreateProjectFolder(projectName, basePath string) (string, error) {
	if basePath == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		basePath = filepath.Join(home, "Documents")
	}
	projectPath := filepath.Join(basePath, projectName)
	if err := os.MkdirAll(projectPath, 0755); err != nil {
		return "", fmt.Errorf("failed to create project: %w", err)
	}
	content := "دالة جمع(أ, ب) -> عدد:\n    ارجع أ + ب\n\nنتيجة = جمع(5, 10)\n\nاطبع(نتيجة)\n"
	if err := os.WriteFile(filepath.Join(projectPath, "main.daad"), []byte(content), 0644); err != nil {
		return "", fmt.Errorf("failed to create project file: %w", err)
	}
	return projectPath, nil
}

func (a *App) settingsPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".daad-ide", "settings.json"), nil
}

func (a *App) ReadSettings() (map[string]string, error) {
	path, err := a.settingsPath()
	if err != nil {
		return nil, err
	}
	content, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		home, _ := os.UserHomeDir()
		return map[string]string{"projectPath": filepath.Join(home, "Documents"), "theme": "vsCodeDark", "themeCategory": "dark"}, nil
	}
	if err != nil {
		return nil, err
	}
	settings := map[string]string{}
	if err := json.Unmarshal(content, &settings); err != nil {
		return nil, fmt.Errorf("failed to parse settings: %w", err)
	}
	return settings, nil
}

func (a *App) WriteSettings(settings map[string]string) error {
	path, err := a.settingsPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	content, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, content, 0644)
}

func (a *App) RunDaad(filePath, interpreterPath string) (map[string]interface{}, error) {
	interpreter, err := resolveInterpreter(interpreterPath)
	if err != nil {
		return nil, err
	}
	cmd := exec.Command(interpreter, filePath)
	cmd.Dir = filepath.Dir(filePath)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, err
	}
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}

	a.processMu.Lock()
	a.process = cmd
	a.stdin = stdin
	a.processMu.Unlock()
	defer func() {
		a.processMu.Lock()
		a.process = nil
		a.stdin = nil
		a.processMu.Unlock()
	}()
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to execute: %w", err)
	}
	var outputMu sync.Mutex
	var output, errorOutput string
	copyOutput := func(reader io.Reader, kind string, target *string) {
		buffer := make([]byte, 4096)
		for {
			count, readErr := reader.Read(buffer)
			if count > 0 {
				chunk := string(buffer[:count])
				outputMu.Lock()
				*target += chunk
				outputMu.Unlock()
				runtime.EventsEmit(a.ctx, "daad-output", map[string]string{"type": kind, "data": chunk})
			}
			if readErr != nil {
				return
			}
		}
	}
	go copyOutput(stdout, "stdout", &output)
	go copyOutput(stderr, "stderr", &errorOutput)
	err = cmd.Wait()
	code := 0
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			code = exitErr.ExitCode()
		} else {
			return nil, err
		}
	}
	return map[string]interface{}{"code": code, "stdout": output, "stderr": errorOutput}, nil
}

func (a *App) WriteDaadStdin(data string) bool {
	a.processMu.Lock()
	defer a.processMu.Unlock()
	if a.process == nil || a.stdin == nil {
		return false
	}
	_, err := io.WriteString(a.stdin, data)
	return err == nil
}

func (a *App) EndDaadStdin() bool {
	a.processMu.Lock()
	defer a.processMu.Unlock()
	if a.process == nil || a.stdin == nil {
		return false
	}
	return a.stdin.Close() == nil
}
