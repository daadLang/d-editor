import { create } from "zustand"

import type { ExtensionContext, ExtensionInfo, RegistryEntry } from "@/core/api"

interface StoreState {
  tab: "installed" | "browse"
  filter: string
  extensions: ExtensionInfo[]
  registry: RegistryEntry[] | null
  registryStatus: "idle" | "loading" | "error"
  registryError: string | null
  registryUrl: string
  /** Extension ids with an action in progress. */
  busy: Record<string, true>
}

export const useStore = create<StoreState>()(() => ({
  tab: "installed",
  filter: "",
  extensions: [],
  registry: null,
  registryStatus: "idle",
  registryError: null,
  registryUrl: "",
  busy: {},
}))

let ctx: ExtensionContext | null = null

export function bindContext(next: ExtensionContext | null) {
  ctx = next
  if (next) syncExtensions()
}

export function syncExtensions() {
  if (ctx) useStore.setState({ extensions: ctx.extensions.list() })
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function withBusy(id: string, work: () => Promise<void>) {
  useStore.setState((s) => ({ busy: { ...s.busy, [id]: true } }))
  try {
    await work()
  } catch (error) {
    ctx?.ui.toast.error(errorText(error))
  } finally {
    useStore.setState((s) => {
      const { [id]: _done, ...busy } = s.busy
      return { busy }
    })
  }
}

export async function loadRegistry() {
  if (!ctx) return
  useStore.setState({ registryStatus: "loading", registryError: null })
  try {
    const [registry, registryUrl] = await Promise.all([
      ctx.extensions.registry.fetch(),
      ctx.extensions.registry.url(),
    ])
    useStore.setState({ registry, registryUrl, registryStatus: "idle" })
  } catch (error) {
    useStore.setState({ registryStatus: "error", registryError: errorText(error) })
  }
}

export async function loadRegistryUrl() {
  if (!ctx) return
  try {
    useStore.setState({ registryUrl: await ctx.extensions.registry.url() })
  } catch {
    // Shown as empty; the registry load reports the real problem.
  }
}

export async function saveRegistryUrl(url: string) {
  if (!ctx) return
  try {
    await ctx.extensions.registry.setUrl(url.trim())
    ctx.ui.toast.info("تم حفظ عنوان السجل")
    await loadRegistry()
  } catch (error) {
    ctx.ui.toast.error(errorText(error))
  }
}

export function installFromRegistry(entry: RegistryEntry, isUpdate: boolean) {
  const current = ctx
  if (!current) return Promise.resolve()
  return withBusy(entry.id, async () => {
    const permissions = entry.permissions?.length
      ? `\n\nالأذونات المطلوبة:\n• ${entry.permissions.join("\n• ")}`
      : ""
    const ok = await current.ui.confirm({
      title: `${isUpdate ? "تحديث" : "تثبيت"} ${entry.name} ${entry.version}؟`,
      message:
        "الإضافات تعمل بكامل صلاحيات المحرر. ثبّت الإضافات التي تثق بمصدرها فقط." +
        permissions,
      confirmLabel: isUpdate ? "تحديث" : "تثبيت",
    })
    if (!ok) return
    const info = await current.extensions.install(entry.id)
    if (info.status === "failed") {
      current.ui.toast.error(info.error ?? `تعذر تشغيل ${info.name}`)
    } else {
      current.ui.toast.info(`تم ${isUpdate ? "تحديث" : "تثبيت"} ${info.name}`)
    }
  })
}

export function uninstall(info: ExtensionInfo) {
  const current = ctx
  if (!current) return Promise.resolve()
  return withBusy(info.id, async () => {
    const dev = info.source === "dev"
    const ok = await current.ui.confirm({
      title: dev ? `إلغاء ربط ${info.name}؟` : `حذف ${info.name}؟`,
      message: dev ? "لن يُحذف مجلد الإضافة من جهازك." : undefined,
      confirmLabel: dev ? "إلغاء الربط" : "حذف",
      danger: true,
    })
    if (ok) await current.extensions.uninstall(info.id)
  })
}

export function setEnabled(info: ExtensionInfo, enabled: boolean) {
  const current = ctx
  if (!current) return Promise.resolve()
  return withBusy(info.id, () => current.extensions.setEnabled(info.id, enabled))
}

export async function linkDev() {
  const current = ctx
  if (!current) return
  try {
    const info = await current.extensions.linkDev()
    if (info) current.ui.toast.info(`تم ربط ${info.name} للتطوير`)
  } catch (error) {
    current.ui.toast.error(errorText(error))
  }
}

/** Compares x.y.z versions; a pre-release suffix is ignored. */
export function isNewer(candidate: string, installed: string) {
  const parts = (v: string) => v.split(/[-+]/)[0].split(".").map(Number)
  const a = parts(candidate)
  const b = parts(installed)
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
  }
  return false
}
