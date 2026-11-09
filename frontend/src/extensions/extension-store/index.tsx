import { Blocks } from "lucide-react"

import type { Extension, ExtensionManifest } from "@/core/api"
import { StorePanel } from "@/extensions/extension-store/store-panel"
import { bindContext, syncExtensions } from "@/extensions/extension-store/store"

export const manifest: ExtensionManifest = {
  id: "extension-store",
  name: "متجر الإضافات",
  version: "0.1.0",
  description: "تصفّح الإضافات وتثبيتها وإدارتها",
}

export const extension: Extension = {
  activate(ctx) {
    bindContext(ctx)
    ctx.extensions.onDidChange(syncExtensions)
    ctx.views.registerSidebarView({
      id: "extension-store",
      title: "الإضافات",
      icon: Blocks,
      component: StorePanel,
      order: 30,
      keybinding: "Mod+Shift+KeyX",
    })
  },

  deactivate() {
    bindContext(null)
  },
}
