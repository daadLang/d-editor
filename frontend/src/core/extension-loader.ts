import type { Extension } from "@/core/api"
import { extensionsBaseUrl, type InstalledExtension } from "@/lib/wails"

const styles = new Map<string, HTMLLinkElement[]>()

function addStyles(id: string, urls: string[]) {
  removeStyles(id)
  styles.set(
    id,
    urls.map((href) => {
      const link = document.createElement("link")
      link.rel = "stylesheet"
      link.href = href
      link.dataset.extension = id
      link.onerror = () => console.error(`[extension ${id}] cannot load ${href}`)
      document.head.append(link)
      return link
    })
  )
}

/** Removes the stylesheets an extension added. */
export function removeStyles(id: string) {
  styles.get(id)?.forEach((link) => link.remove())
  styles.delete(id)
}

/**
 * Imports an installed extension's code from the app's own origin (the Go side
 * serves /_ext/<id>/...). The timestamp makes every load a fresh module, so an
 * update or a rebuilt dev extension is never served from the module cache.
 */
export async function loadInstalledModule(item: InstalledExtension): Promise<Extension> {
  const base = `${extensionsBaseUrl()}/${item.id}`
  const stamp = Date.now()
  addStyles(item.id, (item.styles ?? []).map((file) => `${base}/${file}?v=${stamp}`))

  const module = await import(/* @vite-ignore */ `${base}/${item.main}?v=${stamp}`)
  const extension = typeof module.activate === "function" ? module : module.default
  if (typeof extension?.activate !== "function") {
    throw new Error("الإضافة لا تصدّر الدالة activate")
  }
  return extension as Extension
}
