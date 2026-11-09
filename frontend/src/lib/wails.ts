/**
 * Typed adapter over the Go methods bound by Wails 3 (see app.go / interpreter.go).
 *
 * Inside the desktop shell every call goes through the Wails runtime
 * (`Call.ByName("main.App.<Method>")`). Bound methods are addressed by name, so
 * no generated bindings are needed and the file stays in sync with the Go side
 * simply by method name. When the page is opened in a plain browser
 * (`make dev-frontend`) there is no backend, so a small in-memory mock is used
 * instead, which makes UI work possible without starting the desktop shell.
 */
import { Call, Events } from "@wailsio/runtime"
import { createMockBackend } from "@/lib/wails-mock"

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
}

export interface Settings {
  projectPath: string
  theme: string
  themeCategory: "dark" | "light"
  interpreterPath: string
}

export interface InterpreterOption {
  id: string
  label: string
  path: string
  version: string
  source: string
  releaseTag: string
  releaseUrl: string
  installed: boolean
  selected: boolean
  latest: boolean
}

/** The interpreter the IDE would use right now (see Go `GetInterpreterStatus`). */
export interface InterpreterStatus {
  found: boolean
  path: string
  version: string
  /** Display name such as "daad v0.2.0". */
  label: string
  source: string
  reason: "" | "not-installed" | "missing-file"
}

export interface RunResult {
  code: number
  stdout: string
  stderr: string
}

export interface DaadOutputEvent {
  type: "stdout" | "stderr"
  data: string
}

export interface SearchOptions {
  /** Chosen by the caller so it can listen before the first event arrives. */
  id: string
  root: string
  query: string
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
  /** Ignore Arabic tashkeel and fold alef/yaa variants. */
  ignoreDiacritics: boolean
  /** Comma-separated globs, e.g. "*.daad, src/**". */
  include: string
  exclude: string
  maxResults?: number
  /** Text of open files with unsaved edits, by path. */
  unsaved?: Record<string, string>
}

export interface SearchMatch {
  line: number
  /** 1-based, in UTF-16 units (what CodeMirror uses). */
  column: number
  length: number
  preview: string
  previewStart: number
}

export interface SearchFileResult {
  path: string
  matches: SearchMatch[]
}

export interface SearchSummary {
  files: number
  matches: number
  truncated: boolean
  cancelled: boolean
  durationMs: number
}

/** A match to replace, as a search reported it. */
export interface ReplacePosition {
  line: number
  column: number
  length: number
}

export interface ReplaceTarget {
  path: string
  matches: ReplacePosition[]
}

export interface ReplaceEdit extends ReplacePosition {
  text: string
}

export interface FileEdits {
  path: string
  edits: ReplaceEdit[]
  /** The file on disk was changed; otherwise the caller applies `edits` to its buffer. */
  written: boolean
  /** Matches that were no longer there and were left alone. */
  skipped: number
  error?: string
}

export interface SearchEvent {
  id: string
  files?: SearchFileResult[]
  done: boolean
  summary?: SearchSummary
  error?: string
}

/** An extension found on disk (see internal/extensions). */
export interface InstalledExtension {
  id: string
  name: string
  version: string
  description?: string
  authors?: string[]
  repository?: string
  main: string
  styles?: string[]
  permissions?: string[]
  api: number
  enabled: boolean
  source: "installed" | "dev"
  dir?: string
  error?: string
}

export interface ExtensionsState {
  disabled: string[]
  dev: Record<string, string>
  registryUrl: string
}

/** One extension listed by the registry. */
export interface RegistryEntry {
  id: string
  name: string
  version: string
  description?: string
  authors?: string[]
  repository?: string
  permissions?: string[]
  api: number
  download: { url: string; sha256: string; size?: number }
}

export interface Backend {
  ReadDirectory(dirPath: string): Promise<FileEntry[]>
  ReadFile(filePath: string): Promise<string>
  WriteFile(filePath: string, content: string): Promise<void>
  CreateFile(filePath: string): Promise<void>
  CreateDirectory(dirPath: string): Promise<void>
  DeletePath(targetPath: string): Promise<void>
  RenamePath(oldPath: string, newPath: string): Promise<void>
  OpenFolderDialog(): Promise<string>
  SelectProjectPath(): Promise<string>
  CreateProjectFolder(projectName: string, basePath: string): Promise<string>
  ReadSettings(): Promise<Record<string, string>>
  WriteSettings(settings: Record<string, string>): Promise<void>
  ListInterpreters(configuredPath: string): Promise<InterpreterOption[]>
  GetInterpreterStatus(configuredPath: string): Promise<InterpreterStatus>
  SelectInterpreter(): Promise<string>
  InstallInterpreter(releaseTag: string): Promise<string>
  OpenExternalURL(url: string): Promise<void>
  RunDaad(filePath: string, interpreterPath: string): Promise<RunResult>
  WriteDaadStdin(data: string): Promise<boolean>
  EndDaadStdin(): Promise<boolean>
  StartSearch(options: SearchOptions): Promise<string>
  CancelSearch(id: string): Promise<void>
  ReplaceInFiles(
    options: SearchOptions,
    replacement: string,
    targets: ReplaceTarget[]
  ): Promise<FileEdits[]>
  ListInstalledExtensions(): Promise<InstalledExtension[]>
  GetExtensionsState(): Promise<ExtensionsState>
  SetExtensionEnabled(id: string, enabled: boolean): Promise<void>
  SetRegistryURL(url: string): Promise<void>
  FetchExtensionIndex(): Promise<{ schema: number; extensions: RegistryEntry[] }>
  InstallExtension(id: string): Promise<InstalledExtension>
  UninstallExtension(id: string): Promise<void>
  /** Opens a folder dialog; resolves with an empty `id` when it is cancelled. */
  LinkDevExtension(): Promise<InstalledExtension>
}

export interface EventsApi {
  EventsOn<T = unknown>(event: string, callback: (data: T) => void): () => void
}

/** Go package path + type of the bound service (`package main`, `type App`). */
const SERVICE = "main.App"

/**
 * Builds a `Backend` whose methods forward to the Go service. A Proxy keeps the
 * list of methods in one place: the `Backend` interface above.
 */
function createDesktopBackend(): Backend {
  return new Proxy({} as Backend, {
    get: (_target, method) =>
      typeof method === "string"
        ? (...args: unknown[]) => Call.ByName(`${SERVICE}.${method}`, ...args)
        : undefined,
  })
}

const desktopEvents: EventsApi = {
  EventsOn: (event, callback) =>
    Events.On(event, (e) => callback(e.data as never)),
}

/**
 * True inside the Wails webview. These are the same hooks the Wails runtime
 * itself uses to reach the native side, so they are absent in a normal browser.
 */
function detectDesktop(): boolean {
  const w = window as unknown as {
    chrome?: { webview?: { postMessage?: unknown } }
    webkit?: { messageHandlers?: { external?: { postMessage?: unknown } } }
    wails?: { invoke?: unknown }
  }
  return Boolean(
    w.chrome?.webview?.postMessage ||
      w.webkit?.messageHandlers?.external?.postMessage ||
      w.wails?.invoke
  )
}

const desktop = detectDesktop()
const mock = createMockBackend()
const desktopBackend = createDesktopBackend()

function backend(): Backend {
  return desktop ? desktopBackend : mock.backend
}

function events(): EventsApi {
  return desktop ? desktopEvents : mock.events
}

export const isDesktop = () => desktop

/** Wails rejects with plain strings, so normalise whatever was thrown. */
export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error
  if (error instanceof Error) return error.message
  return String(error)
}

export const api = {
  readDirectory: (dir: string) => backend().ReadDirectory(dir),
  readFile: (path: string) => backend().ReadFile(path),
  writeFile: (path: string, content: string) =>
    backend().WriteFile(path, content),
  createFile: (path: string) => backend().CreateFile(path),
  createDirectory: (path: string) => backend().CreateDirectory(path),
  deletePath: (path: string) => backend().DeletePath(path),
  renamePath: (from: string, to: string) => backend().RenamePath(from, to),
  openFolderDialog: () => backend().OpenFolderDialog(),
  selectProjectPath: () => backend().SelectProjectPath(),
  createProjectFolder: (name: string, basePath: string) =>
    backend().CreateProjectFolder(name, basePath),
  readSettings: () => backend().ReadSettings(),
  writeSettings: (settings: Settings) =>
    backend().WriteSettings({ ...settings }),
  listInterpreters: (configuredPath: string) =>
    backend().ListInterpreters(configuredPath),
  getInterpreterStatus: (configuredPath: string) =>
    backend().GetInterpreterStatus(configuredPath),
  selectInterpreter: () => backend().SelectInterpreter(),
  installInterpreter: (releaseTag: string) =>
    backend().InstallInterpreter(releaseTag),
  openExternalUrl: (url: string) => backend().OpenExternalURL(url),
  runDaad: (filePath: string, interpreterPath: string) =>
    backend().RunDaad(filePath, interpreterPath),
  writeToDaadStdin: (data: string) => backend().WriteDaadStdin(data),
  endDaadStdin: () => backend().EndDaadStdin(),
  /** Subscribes to streamed interpreter output; returns an unsubscribe fn. */
  onDaadOutput: (callback: (event: DaadOutputEvent) => void) =>
    events().EventsOn<DaadOutputEvent>("daad-output", callback),

  startSearch: (options: SearchOptions) => backend().StartSearch(options),
  cancelSearch: (id: string) => backend().CancelSearch(id),
  replaceInFiles: (options: SearchOptions, replacement: string, targets: ReplaceTarget[]) =>
    backend().ReplaceInFiles(options, replacement, targets),
  /** Streamed results of `startSearch`; returns an unsubscribe fn. */
  onSearchEvent: (callback: (event: SearchEvent) => void) =>
    events().EventsOn<SearchEvent>("search-event", callback),

  listInstalledExtensions: () => backend().ListInstalledExtensions(),
  getExtensionsState: () => backend().GetExtensionsState(),
  setExtensionEnabled: (id: string, enabled: boolean) =>
    backend().SetExtensionEnabled(id, enabled),
  setRegistryUrl: (url: string) => backend().SetRegistryURL(url),
  fetchExtensionIndex: () => backend().FetchExtensionIndex(),
  installExtension: (id: string) => backend().InstallExtension(id),
  uninstallExtension: (id: string) => backend().UninstallExtension(id),
  linkDevExtension: () => backend().LinkDevExtension(),
}

/** Where the webview loads an extension's files from (served by Go). */
export const extensionsBaseUrl = () => (desktop ? "/_ext" : "/mock-ext")
