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
import type { FileEntry } from "@/lib/wails"

export type { CommandHandler, CommandOptions, Disposable, Observable, SidebarView, FileEntry }

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
    openFile(path: string): Promise<void>
  }

  ui: {
    toast: {
      info(message: string): void
      error(message: string): void
    }
  }
}
