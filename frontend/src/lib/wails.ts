/**
 * Typed adapter over the Go methods bound by Wails (see app.go / interpreter.go).
 *
 * At runtime Wails injects `window.go.main.App` and `window.runtime`. When the
 * page is opened in a plain browser (`yarn dev:frontend`) there is no backend,
 * so a small in-memory mock is used instead, which makes UI work possible
 * without starting the desktop shell.
 */
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

export interface Backend {
  ReadDirectory(dirPath: string): Promise<FileEntry[]>
  ReadFile(filePath: string): Promise<string>
  WriteFile(filePath: string, content: string): Promise<void>
  CreateFile(filePath: string): Promise<void>
  DeletePath(targetPath: string): Promise<void>
  RenamePath(oldPath: string, newPath: string): Promise<void>
  OpenFolderDialog(): Promise<string>
  SelectProjectPath(): Promise<string>
  CreateProjectFolder(projectName: string, basePath: string): Promise<string>
  ReadSettings(): Promise<Record<string, string>>
  WriteSettings(settings: Record<string, string>): Promise<void>
  ListInterpreters(configuredPath: string): Promise<InterpreterOption[]>
  SelectInterpreter(): Promise<string>
  InstallInterpreter(releaseTag: string): Promise<string>
  OpenExternalURL(url: string): Promise<void>
  RunDaad(filePath: string, interpreterPath: string): Promise<RunResult>
  WriteDaadStdin(data: string): Promise<boolean>
  EndDaadStdin(): Promise<boolean>
}

export interface EventsApi {
  EventsOn(event: string, callback: (data: DaadOutputEvent) => void): () => void
}

declare global {
  interface Window {
    go?: { main?: { App?: Backend } }
    runtime?: EventsApi
  }
}

const mock = createMockBackend()

function backend(): Backend {
  return window.go?.main?.App ?? mock.backend
}

function events(): EventsApi {
  return window.runtime ?? mock.events
}

export const isDesktop = () => Boolean(window.go?.main?.App)

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
    events().EventsOn("daad-output", callback),
}
