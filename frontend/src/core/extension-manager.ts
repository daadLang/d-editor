import { create } from "zustand"

import type { ExtensionInfo, RegistryEntry } from "@/core/api"
import { toDisposable, type DisposableStore } from "@/core/disposable"
import {
  activateExtension,
  deactivateExtension,
  extensionStatus,
  type ExtensionModule,
} from "@/core/extension-host"
import { loadInstalledModule, removeStyles } from "@/core/extension-loader"
import { api, errorMessage, type InstalledExtension } from "@/lib/wails"

/** A built-in extension: shipped in the bundle, enabled by default. */
export interface BuiltinExtension extends ExtensionModule {
  /** Cannot be disabled (the store: without it nothing could be re-enabled). */
  locked?: boolean
}

interface ManagerState {
  items: Record<string, ExtensionInfo>
  /** True once startup has activated everything that is enabled. */
  ready: boolean
}

export const useExtensionStore = create<ManagerState>()(() => ({
  items: {},
  ready: false,
}))

const builtins = new Map<string, BuiltinExtension>()
const installed = new Map<string, InstalledExtension>()

function patch(info: ExtensionInfo) {
  useExtensionStore.setState((state) => ({ items: { ...state.items, [info.id]: info } }))
}

function infoFromModule(module: BuiltinExtension, enabled: boolean): ExtensionInfo {
  const { id, name, version, description } = module.manifest
  return {
    id,
    name,
    version,
    description,
    source: "builtin",
    enabled,
    status: "inactive",
    locked: module.locked,
  }
}

function infoFromInstalled(item: InstalledExtension): ExtensionInfo {
  return {
    id: item.id,
    name: item.name || item.id,
    version: item.version,
    description: item.description,
    authors: item.authors,
    repository: item.repository,
    permissions: item.permissions,
    source: item.source,
    enabled: item.enabled,
    status: item.error ? "failed" : "inactive",
    error: item.error,
  }
}

/** Runs an extension and records how it went. Never throws. */
async function run(id: string): Promise<void> {
  const current = useExtensionStore.getState().items[id]
  if (!current) return
  try {
    let module = builtins.get(id)
    if (!module) {
      const item = installed.get(id)
      if (!item) return
      const loaded = await loadInstalledModule(item)
      module = {
        manifest: {
          id: item.id,
          name: item.name,
          version: item.version,
          description: item.description,
        },
        activate: loaded.activate.bind(loaded),
        deactivate: loaded.deactivate?.bind(loaded),
      }
    }
    await activateExtension(module)
    const status = extensionStatus(id)
    patch({
      ...current,
      status: status === "active" ? "active" : "failed",
      error: status === "active" ? undefined : "تعذر تشغيل الإضافة",
    })
  } catch (error) {
    console.error(`[extension ${id}] failed to load`, error)
    removeStyles(id)
    patch({ ...current, status: "failed", error: errorMessage(error) })
  }
}

async function stop(id: string) {
  await deactivateExtension(id)
  removeStyles(id)
  const current = useExtensionStore.getState().items[id]
  if (current) patch({ ...current, status: "inactive", error: undefined })
}

function remember(list: InstalledExtension[]) {
  for (const item of list) {
    if (builtins.has(item.id)) continue // a built-in cannot be replaced
    installed.set(item.id, item)
    patch(infoFromInstalled(item))
  }
}

/** Activates the built-ins, then loads what is installed. Called once at startup. */
export async function startManager(list: BuiltinExtension[]) {
  list.forEach((module) => builtins.set(module.manifest.id, module))

  let disabled = new Set<string>()
  try {
    disabled = new Set((await api.getExtensionsState()).disabled)
  } catch (error) {
    console.error("cannot read the extensions state", error)
  }

  list.forEach((module) =>
    patch(infoFromModule(module, module.locked || !disabled.has(module.manifest.id)))
  )
  // Built-ins first: they provide the views the user sees on launch.
  await Promise.all(
    list.filter((m) => useExtensionStore.getState().items[m.manifest.id].enabled).map((m) => run(m.manifest.id))
  )
  useExtensionStore.setState({ ready: true })

  try {
    remember(await api.listInstalledExtensions())
  } catch (error) {
    console.error("cannot list installed extensions", error)
  }
  await Promise.all(
    Object.values(useExtensionStore.getState().items)
      .filter((info) => info.source !== "builtin" && info.enabled && !info.error)
      .map((info) => run(info.id))
  )
}

export async function setExtensionEnabled(id: string, enabled: boolean) {
  const current = useExtensionStore.getState().items[id]
  if (!current || current.locked) return
  await api.setExtensionEnabled(id, enabled)
  patch({ ...current, enabled })
  if (enabled) await run(id)
  else await stop(id)
}

/** Installs, or updates, from the registry, and starts it right away. */
export async function installExtension(id: string): Promise<ExtensionInfo> {
  if (builtins.has(id)) throw new Error("هذه إضافة مدمجة ولا يمكن استبدالها")
  const previous = useExtensionStore.getState().items[id]
  if (previous) await stop(id)
  const item = await api.installExtension(id)
  installed.set(item.id, item)
  patch(infoFromInstalled(item))
  if (item.enabled && !item.error) await run(item.id)
  return useExtensionStore.getState().items[item.id]
}

export async function uninstallExtension(id: string) {
  if (builtins.has(id)) throw new Error("لا يمكن حذف إضافة مدمجة، يمكنك تعطيلها")
  await stop(id)
  await api.uninstallExtension(id)
  installed.delete(id)
  useExtensionStore.setState((state) => {
    const { [id]: _removed, ...rest } = state.items
    return { items: rest }
  })
}

export async function linkDevExtension(): Promise<ExtensionInfo | null> {
  const item = await api.linkDevExtension()
  if (!item.id) return null
  if (builtins.has(item.id)) throw new Error("المعرّف يطابق إضافة مدمجة")
  await stop(item.id)
  installed.set(item.id, item)
  patch(infoFromInstalled(item))
  if (item.enabled && !item.error) await run(item.id)
  return useExtensionStore.getState().items[item.id]
}

export function createExtensionsApi(store: DisposableStore) {
  return {
    list: () => Object.values(useExtensionStore.getState().items),
    onDidChange: (listener: () => void) =>
      store.add(toDisposable(useExtensionStore.subscribe(listener))),
    setEnabled: setExtensionEnabled,
    install: installExtension,
    uninstall: uninstallExtension,
    linkDev: linkDevExtension,
    registry: {
      url: async () => (await api.getExtensionsState()).registryUrl,
      setUrl: (url: string) => api.setRegistryUrl(url),
      fetch: async (): Promise<RegistryEntry[]> =>
        (await api.fetchExtensionIndex()).extensions ?? [],
    },
  }
}
