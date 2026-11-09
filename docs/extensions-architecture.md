# d-editor: core + extensions architecture

Goal: turn d-editor into a VS Code-style IDE with a small **core** and **extensions**. The first three extensions (installed by default) are **Explorer**, **Search** (find in files), and the **Extension Store**. Extensions are published through a Zed-style registry repo that includes each extension repo as a git submodule.

---

## 1. What the code looks like today

Findings from reading `daadLang/d-editor` (main, 58 commits):

| Area | Current state | Consequence |
|---|---|---|
| Stack | Wails 3 (Go) + React 19, Zustand, shadcn/ui, CodeMirror 6, RTL | Extensions will be JS/React, loaded in the webview |
| Sidebar | `workbench.tsx` hard-codes `<Explorer />` in the side panel. There is **no activity bar**. `app-sidebar.tsx` is dead code (nothing imports it) | Need an activity bar + a sidebar host that renders contributed views |
| Explorer state | Lives inside the 910-line `store/ide.ts`: `treeVersion`, `collapseVersion`, `createFileIn`, `createFolderIn`, `renameEntry`, `deleteEntry`, and the dialog kinds `new-file`, `new-folder`, `rename`, `delete` | Cannot be moved as-is: `renameEntry` / `deleteEntry` also remap open tabs and editor groups, so the *file operation* must stay in core and the *tree UI* moves out |
| Commands | The palette (`command-palette.tsx`) has a hard-coded action array; shortcuts are a hard-coded `switch` in `use-shortcuts.ts` (uses `event.code`, so they work on an Arabic layout) | Need a command + keybinding registry; core commands move onto it too |
| Backend | One Go service, `main.App`, called by name: `Call.ByName("main.App.X")` through the typed `Backend` interface in `lib/wails.ts`, with a browser mock in `wails-mock.ts` | New services can use the same by-name pattern; the mock needs matching entries |
| Production CSP | `script-src 'self'`, `connect-src 'self'` (in `vite.config.ts`) | The webview **cannot** fetch extension code from the internet. Downloads must happen in Go; code must be served from the app's own origin |
| Downloads | `interpreter.go` already downloads GitHub release assets (`InstallInterpreter` / `installRelease`) | Same pattern can install extensions |
| In-editor find | `@codemirror/search` (Ctrl+F) is already wired in `code-editor.tsx` | Core keeps in-file find. The Search extension is *find in files* |
| Open buffers | `editorRegistry.getText(fileId)` returns in-memory text of open files | Search must prefer unsaved buffers over disk for open files |
| Tab types | `Tab = FileTab | SettingsTab` only | An extension details page as an editor tab needs a generic custom tab type (v2) |
| Settings | `map[string]string` in `~/.daad-ide/settings.json` | Extension enable/disable state needs its own file |

---

## 2. Target architecture

```
┌──────────────────────────── d-editor (core) ─────────────────────────────┐
│ Workbench layout · Activity bar · Sidebar host · Editor groups/tabs       │
│ CodeMirror editor · Output panel · Status bar · Menu bar · Themes         │
│ Command registry · Keybinding registry · Settings · Interpreter/Run       │
│ Workspace service (folder, fs ops w/ tab remap, change events)            │
│ Extension host (load / activate / dispose)                                │
│ ───────────────────────── Go ─────────────────────────────────────────── │
│ App (existing) · ExtensionService (new) · SearchService (new)             │
│ asset mux: embedded UI + /_ext/<id>/… served from disk                    │
└────────────┬──────────────────────────────────────────────────────────────┘
             │ activate(ctx)
   ┌─────────┴───────────┬───────────────────┬──────────────────────┐
   │ explorer            │ search            │ extension-store      │   default
   │ (file tree)         │ (find in files)   │ (browse/install)     │   extensions
   └─────────────────────┴───────────────────┴──────────────────────┘
```

### Extension package

```
ext-search/
├── extension.toml        # manifest (Zed-style)
├── package.json
├── src/index.tsx         # export activate(ctx), deactivate()
├── dist/index.js         # built; NOT committed
└── LICENSE
```

```toml
# extension.toml
id = "search"
name = "Search"
version = "0.1.0"
schema_version = 1
description = "Find text across the workspace"
authors = ["daadLang"]
repository = "https://github.com/daadLang/ext-search"
main = "dist/index.js"

[engines]
daad-ide = ">=0.2.0"   # host API version it was built for

permissions = ["workspace.read", "workspace.search"]   # shown in the store
```

### API sketch (v1, a separate types package `@daad-ide/api`)

Everything is **async and serializable** so a sandbox stays possible later (see risks).

```ts
export interface Extension {
  activate(ctx: ExtensionContext): void | Promise<void>
  deactivate?(): void | Promise<void>
}

export interface ExtensionContext {
  id: string
  subscriptions: Disposable[]            // disposed automatically on deactivate

  commands: {
    register(id: string, run: (...a: unknown[]) => unknown,
             meta?: { title: string; keybinding?: string; icon?: ComponentType }): Disposable
    execute(id: string, ...args: unknown[]): Promise<unknown>
  }

  views: {
    registerSidebarView(v: {
      id: string; title: string; icon: ComponentType
      order?: number; keybinding?: string       // e.g. "Ctrl+Shift+KeyF" (event.code based)
      component: ComponentType
    }): Disposable
  }

  workspace: {
    folder: Observable<string | null>
    fs: {                                       // rename/delete also fix open tabs + groups
      readDirectory(path: string): Promise<FileEntry[]>
      readFile(path: string): Promise<string>
      writeFile(path: string, text: string): Promise<void>
      createFile(path: string): Promise<void>
      createDirectory(path: string): Promise<void>
      rename(from: string, to: string): Promise<void>
      delete(path: string): Promise<void>
    }
    onDidChangeFiles(cb: (e: { paths: string[] }) => void): Disposable
    findText(q: SearchQuery, onBatch: (b: SearchBatch) => void,
             signal: AbortSignal): Promise<SearchSummary>
  }

  editor: {
    openFile(path: string, at?: { line: number; col: number; length?: number }): Promise<void>
    activePath: Observable<string | null>
    unsavedText(path: string): string | undefined     // backed by editorRegistry.getText
    startFileDrag(e: DragEvent, entry: FileEntry): void  // core owns the DnD protocol (tab-dnd.ts)
  }

  ui: {
    prompt(o: { title: string; initial?: string }): Promise<string | null>
    confirm(o: { title: string; message: string; danger?: boolean }): Promise<boolean>
    toast: { info(m: string): void; error(m: string): void }
    kit: typeof import("@daad-ide/ui")                 // re-exported shadcn components
  }

  settings: { get<T>(key: string): T | undefined; set(key: string, v: unknown): Promise<void> }
  statusBar: { registerItem(i: StatusItem): Disposable }
}
```

### How extension code gets loaded under the CSP

* **Location.** Default extensions are built into `frontend/dist/extensions/<id>/` (embedded in the binary by `go:embed`). User-installed ones live in `~/.daad-ide/extensions/<id>/<version>/`.
* **Serving.** `main.go` wraps the asset handler in a small mux: `/_ext/<id>/…` is served from disk, everything else from the embedded FS. This is the same origin, so `script-src 'self'` allows it and the CSP stays strict.
* **Loading.** The host calls `import(url)` on `main`, then `activate(ctx)`. A failure in one extension is caught, shown in the store as "failed to activate", and does not affect the rest.
* **One React.** Extension builds (Vite lib mode) mark `react`, `react-dom`, `react/jsx-runtime` and `@daad-ide/ui` as externals mapped to `globalThis.__DAAD__.*`, set by the host before loading anything. (An inline import map would need a CSP hash; globals avoid touching the CSP.)
* **Install.** Go downloads the `.tar.gz`, verifies its sha256 against `index.json`, extracts to the user dir, then the host loads it **without a restart**. Updates and uninstalls may ask for a restart in v1.
* **Built-in extensions** can be disabled but not uninstalled. Enabled/disabled state is stored in `~/.daad-ide/extensions.json`.

---

## 3. Core refactors (in order)

1. **Activity bar + sidebar host.** Replace `<Explorer />` in `workbench.tsx` with `<ActivityBar />` + `<SidebarHost />`; add `activeSidebarView` to `store/layout.ts`. In this RTL layout the rail goes on the start edge (the right side), next to the side panel. Delete `app-sidebar.tsx`.
2. **Command + keybinding registry.** Build the palette list and the shortcut handler from the registry. Re-register the existing core commands (run, save, split, toggle output, …) through it so the core uses its own API. Keybindings are written as `event.code` strings (`Ctrl+Shift+KeyF`) to keep working on Arabic layouts.
3. **Workspace service.** Extract folder state and the file operations from `ide.ts`. `renameEntry` and `deleteEntry` keep their tab/group remapping and become `workspace.fs.rename/delete`. `treeVersion` becomes `onDidChangeFiles` with paths, which both the explorer and search can use. Remove `treeVersion`, `collapseVersion` and the four explorer dialog kinds from the core store.
4. **Generic dialogs.** `ui.prompt` / `ui.confirm` replace the `new-file`, `new-folder`, `rename`, `delete` kinds in `dialogs.tsx`. `new-project` stays in core.
5. **Editor reveal.** `editor.openFile(path, { line, col })` plus a selection/scroll helper (the registry has no reveal-range API today).
6. **Extension host** (loader, registry of contributions, dispose-on-disable), with the `__DAAD__` globals.
7. **Go side.** `ExtensionService` (list, fetch index, install, uninstall, set enabled), `SearchService`, and the asset mux in `main.go`. Add all new methods to `wails-mock.ts` so `make dev-frontend` keeps working.

---

## 4. The three extensions

### explorer
* Moves `explorer.tsx`, `file-tree.tsx`, and the explorer parts of `dialogs.tsx` out of core.
* Commands: `explorer.newFile`, `explorer.newFolder`, `explorer.refresh`, `explorer.collapseAll`, `explorer.revealActiveFile`. Keybinding `Ctrl+Shift+KeyE`.
* The "no folder open" empty state runs the core commands `workspace.openFolder` and `workspace.newProject`.
* Drag from tree into editor groups keeps working through `editor.startFileDrag`.
* The logo header currently lives inside `Explorer`; move it to the activity bar or title area so it stays when explorer is disabled.

### search (find in files)
* UI: query box, toggles (match case, whole word, regex), include/exclude globs, results grouped by file with line previews, click to open at line/col. `Ctrl+Shift+KeyF`. Replace-in-files is a follow-up.
* Backend (Go `SearchService`): `StartSearch(opts) → searchId`, results streamed in batches through Wails events, `CancelSearch(id)`. Worker pool over `filepath.WalkDir`; skips `.git`, `node_modules`, binary and very large files; honors `.gitignore`.
* Open files with unsaved edits are searched from `editor.unsavedText`, not from disk.
* Idea specific to this IDE: an optional "ignore tashkeel / normalize alef and hamza forms" toggle for Arabic text.
* The core keeps CodeMirror's in-file find (Ctrl+F).

### extension-store
* Sidebar view `Ctrl+Shift+KeyX`: **Installed** and **Browse** lists, search box, install / update / uninstall / enable / disable, permissions list, failed-activation status.
* Reads `index.json` through Go (`FetchIndex`), because the webview cannot reach the network.
* v1 shows details inline in the sidebar. A full details page needs a generic custom tab type (`Tab = FileTab | SettingsTab` today), which is a v2 item.
* For development it supports "Install dev extension" (link a local folder), like Zed.

---

## 5. Repositories (Zed-style)

What the Zed repo does (checked): `extensions.toml` at the root with one table per extension, `.gitmodules`, `extensions/<id>` submodules, and `dangerfile.ts` that fails a PR unless `extensions.toml` changed (new extension = new entry, update = version bump). Entries look like:

```toml
[0x96f]
submodule = "extensions/0x96f"
version = "1.4.0"
# optional: path = "subdir"   (extension files live in a subfolder of the submodule)
```
and are kept alphabetical.

Proposed layout:

```
daadLang/d-editor            core IDE + packages/api (@daad-ide/api types)
daadLang/extensions          the registry
├── extensions.toml          [explorer] submodule="extensions/explorer" version="0.1.0" …
├── .gitmodules              https:// URLs so CI can clone anonymously
├── extensions/
│   ├── explorer        →  daadLang/ext-explorer
│   ├── extension-store →  daadLang/ext-extension-store
│   └── search          →  daadLang/ext-search
├── scripts/                 validate · package · build-index
└── .github/workflows/       pr-check.yml · publish.yml
```

**One difference from Zed that matters:** Zed compiles each extension from source in its own CI. Do the same here. The registry CI builds every changed submodule at its pinned commit (`pnpm install --frozen-lockfile && pnpm build`) instead of trusting a committed `dist/`. Reviewers then audit source, and the published artifact is reproducible.

**PR check** (`pr-check.yml`): `extensions.toml` sorted; `id` in `extension.toml` equals the table key; `version` equals the manifest's; version bumped when the submodule pointer moved; `engines.daad-ide` is a valid range; license file present; build succeeds; bundle size under a limit.

**Publish** (`publish.yml`, on merge to main): package `<id>-<version>.tar.gz` + sha256, attach to a GitHub Release, regenerate `index.json` (id, name, description, version, author, repository, permissions, `engines`, download URL, sha256) and publish it (Pages or release asset). The store reads this file.

**Updating an extension:** release in its own repo → PR in `daadLang/extensions` bumping the submodule pointer and `version`.

**Default extensions in the IDE:**
* `d-editor/bundled-extensions.json` pins `{ "explorer": "0.1.0", "search": "0.1.0", "extension-store": "0.1.0" }`.
* The release workflow downloads those packages from the registry, checks sha256 against `index.json`, and unpacks them into `frontend/public/extensions/` **before** `wails3 build`, so they are embedded. The defaults are therefore byte-identical to what the store would install.
* d-editor does **not** add the registry as a submodule; that would drag every community extension into the core checkout.
* Local development: `make dev-extension EXT=../ext-search` links a folder into the user extensions dir.

**Bootstrapping order** (avoids a chicken-and-egg): build the three extensions **inside d-editor first** (`frontend/src/extensions/<id>/`), restricted to imports from the public API package (enforce with an ESLint `no-restricted-imports` rule). When the API settles, extract each folder into its own repo with history (`git subtree split` / `git filter-repo`), add them as submodules, and switch the build to the bundled packages.

---

## 6. Phases

| Phase | Work | Done when |
|---|---|---|
| **0. Spike** (1–2 days) | A "hello" extension served by Go at `/_ext/hello/index.js`, `import()`ed by the webview, using host React, registering a sidebar view. Test in a **production** `wails3 build` (the strict CSP is off in dev). Also confirm that a second Go service is callable as `Call.ByName("main.<Type>.<Method>")`. | Works in a packaged build on Linux and Windows |
| **1. Core host** | Items 1–7 from section 3 except the Go services; everything still in-tree | App behaves as today, but sidebar, palette and shortcuts are driven by registries |
| **2. Explorer extension** (in-tree) | Section 4 explorer; remove explorer state from `ide.ts` | Disabling it leaves a working editor with an empty sidebar |
| **3. Go ExtensionService** | User extension dir, asset mux, manifest validation, install/uninstall/enable, `index.json` client | Dev-linked extension loads without restart |
| **4. Search extension** | `SearchService` + UI | Searches a large folder without freezing the UI; cancelable |
| **5. Store extension** | UI over ExtensionService, using a local fixture `index.json` | Install / disable / uninstall works end to end |
| **6. Registry + release** | `daadLang/extensions` repo, CI, extract the three extensions, bundle defaults in `release.yml` | A tagged IDE release ships with all three installed, and the store can update them |

---

## 7. Risks and decisions

1. **Trust model.** Extensions run in the same webview and can call *every* `main.App` method (including `DeletePath`). v1 mitigations: source review in registry PRs, build from source, permissions shown before install. A real sandbox (iframe + postMessage RPC) would cost the native look of extension UI. **Decision:** ship in-process v1, but keep the API async/serializable so a sandbox remains possible. Say clearly in the store UI that extensions are trusted code.
2. **API stability.** Add `apiVersion` (integer) to the host and `engines.daad-ide` to manifests; the store hides or flags incompatible extensions. Version `@daad-ide/api` with semver.
3. **Manifest format.** `extension.toml` (matches the Zed direction; needs a TOML parser in Go, easy) vs `package.json` (JS tooling already understands it). Recommendation: `extension.toml`, with `package.json` only for build tooling.
4. **RTL.** Extension UI must use logical CSS (`ps-`/`pe-`, `start`/`end`); document it in the API guide. Keybindings use `event.code`.
5. **Updates while running.** Hot-load on install; for updates/uninstall of an active extension, ask for restart in v1.
6. **Where `index.json` lives.** GitHub Pages on the registry repo is the simplest. It is a single point of failure; ship the last-known index with the app for offline use.
7. **Browser dev mode.** Every new Go method needs a `wails-mock.ts` entry, or `make dev-frontend` breaks.

### Decisions made while implementing search and the store

- **Manifest is `extension.json`, not TOML** (decision 3 above). The Go side needs no parser dependency and extension authors already know JSON. Fields: `id`, `name`, `version`, `main`, `styles`, `permissions`, `api`.
- **Updates hot-load** (decision 5 above). Installing over an active extension stops it, replaces its files atomically, and starts the new version with a cache-busting URL. Uninstall stops it first. No restart is needed.
- **Registry URL is a setting.** `extensions.DefaultRegistryURL` in `internal/extensions/registry.go` is a placeholder (`https://daadlang.github.io/extensions/index.json`); the store's "registry address" field overrides it, and it may be a local folder or `file://` path while the registry is being built. A remote index cannot point at local files; plain http is accepted only for loopback.
- **The frontend only names the extension to install.** Download URL and sha256 come from the registry index read in Go, so a compromised webview cannot make Go fetch an arbitrary URL.
- **Install is the trust boundary.** Archives are extracted with no symlinks, hard links, devices, absolute or `..` paths, and with file-count and size limits. Permissions are informational in v1 and are shown in a confirmation dialog.
- **The store is locked.** It is built in and cannot be disabled; otherwise nothing disabled could be re-enabled.
- **Disabled state** lives in `~/.daad-ide/extensions.json` and applies to built-in and installed extensions alike.
