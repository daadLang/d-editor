import { toast } from "sonner"

import type { Extension, ExtensionContext, ExtensionManifest } from "@/core/api"
import { executeCommand, registerCommand } from "@/core/commands"
import { toDisposable, DisposableStore, type Observable } from "@/core/disposable"
import { registerSidebarView } from "@/core/views"
import { api } from "@/lib/wails"
import { openFile, useIdeStore } from "@/store/ide"

export interface ExtensionModule extends Extension {
  manifest: ExtensionManifest
}

type Status = "inactive" | "active" | "failed"

interface Entry {
  module: ExtensionModule
  status: Status
  store: DisposableStore
  error?: unknown
}

const entries = new Map<string, Entry>()

/** Watches one slice of the IDE store. */
function select<T>(read: (state: ReturnType<typeof useIdeStore.getState>) => T): Observable<T> {
  return {
    get: () => read(useIdeStore.getState()),
    subscribe(listener) {
      let last = read(useIdeStore.getState())
      const stop = useIdeStore.subscribe((state) => {
        const next = read(state)
        if (Object.is(next, last)) return
        last = next
        listener(next)
      })
      return toDisposable(stop)
    },
  }
}

function createContext(id: string, store: DisposableStore): ExtensionContext {
  const subscriptions: ExtensionContext["subscriptions"] = []
  return {
    id,
    subscriptions,

    commands: {
      register: (commandId, run, options) =>
        store.add(registerCommand(commandId, run, options)),
      execute: executeCommand,
    },

    views: {
      registerSidebarView: (view) => store.add(registerSidebarView(view)),
    },

    workspace: {
      folder: select((state) => state.folder),
      onDidChangeFiles(listener) {
        return store.add(
          toDisposable(
            useIdeStore.subscribe((state, previous) => {
              if (state.treeVersion !== previous.treeVersion) listener()
            })
          )
        )
      },
      fs: {
        readDirectory: (path) => api.readDirectory(path),
        readFile: (path) => api.readFile(path),
      },
    },

    editor: {
      openFile: (path) => openFile(path),
    },

    ui: {
      toast: {
        info: (message) => void toast(message),
        error: (message) => void toast.error(message),
      },
    },
  }
}

/** Activates one extension. A failure is contained: it never stops the others. */
export async function activateExtension(module: ExtensionModule) {
  const { id } = module.manifest
  if (entries.get(id)?.status === "active") return

  const store = new DisposableStore()
  const entry: Entry = { module, status: "inactive", store }
  entries.set(id, entry)

  const ctx = createContext(id, store)
  try {
    await module.activate(ctx)
    ctx.subscriptions.forEach((item) => store.add(item))
    entry.status = "active"
  } catch (error) {
    store.dispose()
    entry.status = "failed"
    entry.error = error
    console.error(`[extension ${id}] failed to activate`, error)
    toast.error(`تعذر تشغيل الإضافة ${module.manifest.name}`)
  }
}

export async function deactivateExtension(id: string) {
  const entry = entries.get(id)
  if (!entry || entry.status !== "active") return
  try {
    await entry.module.deactivate?.()
  } catch (error) {
    console.error(`[extension ${id}] deactivate failed`, error)
  }
  entry.store.dispose()
  entry.status = "inactive"
}

export const extensionStatus = (id: string): Status =>
  entries.get(id)?.status ?? "inactive"
