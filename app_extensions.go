package main

import (
	"context"
	"time"

	"github.com/daadLang/d-editor/internal/extensions"
	"github.com/daadLang/d-editor/internal/search"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// The methods below are thin wrappers over internal/search and
// internal/extensions, which hold the logic (and the tests). They live on App
// so they are called the same way as every other method:
// Call.ByName("main.App.<Method>"), see frontend/src/lib/wails.ts.

// builtinExtensions ship inside the frontend bundle. They can be disabled but
// not replaced by an installed extension of the same ID.
var builtinExtensions = []string{"explorer", "search", "extension-store"}

// searchEventName carries search.Event values to the frontend.
const searchEventName = "search-event"

// --- find in files ----------------------------------------------------------

// StartSearch begins a search in the background and returns its ID. Results
// arrive as "search-event" events; the caller picks the ID (opts.ID) up front
// so it can subscribe before the first event can possibly be emitted.
func (a *App) StartSearch(opts search.Options) (string, error) {
	return a.searches.Start(opts, func(event search.Event) {
		application.Get().Event.Emit(searchEventName, event)
	})
}

// CancelSearch stops a running search. Unknown IDs are ignored.
func (a *App) CancelSearch(id string) {
	a.searches.Cancel(id)
}

// --- extensions -------------------------------------------------------------

// ListInstalledExtensions lists installed and dev-linked extensions.
func (a *App) ListInstalledExtensions() ([]extensions.Installed, error) {
	list, err := a.extensions.List()
	if list == nil {
		list = []extensions.Installed{}
	}
	return list, err
}

// GetExtensionsState returns the disabled IDs and the registry URL in use.
func (a *App) GetExtensionsState() (extensions.State, error) {
	return a.extensions.State()
}

// SetExtensionEnabled switches an extension (built-in or installed) on or off.
func (a *App) SetExtensionEnabled(id string, enabled bool) error {
	return a.extensions.SetEnabled(id, enabled)
}

// SetRegistryURL changes the registry the store reads; "" restores the default.
func (a *App) SetRegistryURL(address string) error {
	return a.extensions.SetRegistryURL(address)
}

// FetchExtensionIndex reads the registry's index.
func (a *App) FetchExtensionIndex() (extensions.Index, error) {
	state, err := a.extensions.State()
	if err != nil {
		return extensions.Index{}, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	index, _, err := extensions.FetchIndex(ctx, state.RegistryURL)
	if index.Extensions == nil {
		index.Extensions = []extensions.IndexEntry{}
	}
	return index, err
}

// InstallExtension installs (or updates to) the registry's version of id. The
// frontend only names the extension; the download address and checksum come
// from the registry index, read here.
func (a *App) InstallExtension(id string) (extensions.Installed, error) {
	state, err := a.extensions.State()
	if err != nil {
		return extensions.Installed{}, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	return a.extensions.Install(ctx, state.RegistryURL, id)
}

// UninstallExtension removes an installed extension, or unlinks a dev one.
func (a *App) UninstallExtension(id string) error {
	return a.extensions.Uninstall(id)
}

// LinkDevExtension asks for a folder and links it as a development extension.
// An empty result (no ID) means the dialog was cancelled.
func (a *App) LinkDevExtension() (extensions.Installed, error) {
	dir, err := a.OpenFolderDialog()
	if err != nil || dir == "" {
		return extensions.Installed{}, err
	}
	return a.extensions.LinkDev(dir)
}

// ReplaceInFiles replaces the given matches (as reported by a search with the
// same options). Files named in opts.Unsaved are not written; their edits come
// back for the frontend to apply to the open buffer.
func (a *App) ReplaceInFiles(opts search.Options, replacement string, targets []search.Target) ([]search.FileEdits, error) {
	return search.Replace(opts, replacement, targets)
}
