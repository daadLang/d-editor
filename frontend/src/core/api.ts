/**
 * The public extension API (v1, in progress).
 *
 * Extensions only receive an `ExtensionContext` and import *types* from here.
 * Everything they register is tracked in `subscriptions` and released when the
 * extension is deactivated or disabled.
 *
 * Implemented so far: commands, sidebar views, workspace folder/read-only fs,
 * editor.openFile and toasts. Planned next (see docs): write operations that
 * keep open tabs in sync, prompt/confirm dialogs, file-change events with
 * paths, status bar items, find-in-files.
 */
import type {
  CommandHandler,
  CommandOptions,
} from "@/core/commands"
import type { Disposable, Observable } from "@/core/disposable"
import type { SidebarView } from "@/core/views"
import type { ConfirmOptions } from "@/core/confirm"
import type { ReplaceResult, SearchQuery } from "@/core/find-text"
import type { RevealTarget } from "@/lib/editor-registry"
import type {
  FileEntry,
  RegistryEntry,
  ReplaceTarget,
  SearchFileResult,
  SearchMatch,
  SearchSummary,
} from "@/lib/wails"

/** Version of the extension API this IDE offers (matches Go's extensions.APIVersion). */
export const API_VERSION = 1

export type {
  CommandHandler,
  CommandOptions,
  ConfirmOptions,
  Disposable,
  FileEntry,
  Observable,
  RegistryEntry,
  ReplaceResult,
  ReplaceTarget,
  RevealTarget,
  SearchFileResult,
  SearchMatch,
  SearchQuery,
  SearchSummary,
  SidebarView,
}

/** An extension as the extension manager knows it. */
export interface ExtensionInfo {
  id: string
  name: string
  version: string
  description?: string
  authors?: string[]
  repository?: string
  permissions?: string[]
  source: "builtin" | "installed" | "dev"
  enabled: boolean
  status: "active" | "inactive" | "failed"
  /** Why it is not running, when it failed. */
  error?: string
  /** Built-in extensions that cannot be disabled (the store itself). */
  locked?: boolean
}

export interface ExtensionManifest {
  id: string
  name: string
  version: string
  description?: string
}

export interface Extension {
  activate(ctx: ExtensionContext): void | Promise<void>
  deactivate?(): void | Promise<void>
}

export interface ExtensionContext {
  readonly id: string
  /** Anything pushed here is disposed when the extension is deactivated. */
  readonly subscriptions: Disposable[]

  commands: {
    register(id: string, run: CommandHandler, options?: CommandOptions): Disposable
    execute(id: string, ...args: unknown[]): Promise<unknown>
  }

  views: {
    registerSidebarView(view: SidebarView): Disposable
  }

  workspace: {
    /** The open folder, or null. */
    folder: Observable<string | null>
    /** Fires when the file system changed through the IDE (create, rename, delete, refresh). */
    onDidChangeFiles(listener: () => void): Disposable
    fs: {
      readDirectory(path: string): Promise<FileEntry[]>
      readFile(path: string): Promise<string>
    }
  }

  editor: {
    /** Opens a file, optionally scrolling to a 1-based line/column. */
    openFile(path: string, at?: RevealTarget): Promise<void>
  }

  /** Find in files over the open folder. Unsaved editor text is searched too. */
  findText(
    query: SearchQuery,
    onBatch: (files: SearchFileResult[]) => void,
    signal?: AbortSignal
  ): Promise<SearchSummary>

  /**
   * Replaces matches that `findText` reported, with the same query options.
   * Open files are edited in their editor (left unsaved); others are written.
   * Matches that changed since the search are skipped and counted.
   */
  replaceText(
    query: SearchQuery,
    replacement: string,
    targets: ReplaceTarget[]
  ): Promise<ReplaceResult>

  /** Managing extensions. Meant for the extension store. */
  extensions: {
    list(): ExtensionInfo[]
    /** Calls the listener whenever any extension changes; returns the unsubscribe. */
    onDidChange(listener: () => void): Disposable
    setEnabled(id: string, enabled: boolean): Promise<void>
    install(id: string): Promise<ExtensionInfo>
    uninstall(id: string): Promise<void>
    /** Asks for a folder and runs it as a development extension; null if cancelled. */
    linkDev(): Promise<ExtensionInfo | null>
    registry: {
      url(): Promise<string>
      /** "" restores the default registry. */
      setUrl(url: string): Promise<void>
      fetch(): Promise<RegistryEntry[]>
    }
  }

  ui: {
    confirm(options: ConfirmOptions): Promise<boolean>
    toast: {
      info(message: string): void
      error(message: string): void
    }
  }
}
