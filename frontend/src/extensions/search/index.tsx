import { Search } from "lucide-react"

import type { Extension, ExtensionManifest } from "@/core/api"
import { SearchPanel } from "@/extensions/search/search-panel"
import { FOCUS_REPLACE_EVENT } from "@/extensions/search/events"
import { bindContext, clearResults, useSearchStore } from "@/extensions/search/store"

export const manifest: ExtensionManifest = {
  id: "search",
  name: "البحث",
  version: "0.1.0",
  description: "البحث في ملفات المجلد المفتوح",
}

export const extension: Extension = {
  activate(ctx) {
    bindContext(ctx)

    ctx.views.registerSidebarView({
      id: "search",
      title: "بحث",
      icon: Search,
      component: SearchPanel,
      order: 20,
      keybinding: "Mod+Shift+KeyF",
    })

    // Revealing the view (its shortcut or this command) also focuses the box.
    ctx.commands.register(
      "search.focus",
      () => ctx.commands.execute("view.show.search"),
      { title: "البحث في الملفات" }
    )

    ctx.commands.register(
      "search.replace",
      async () => {
        useSearchStore.setState({ showReplace: true })
        await ctx.commands.execute("view.show.search")
        window.dispatchEvent(new Event(FOCUS_REPLACE_EVENT))
      },
      { title: "الاستبدال في الملفات", keybinding: "Mod+Shift+KeyH" }
    )

    // A new folder makes old results meaningless.
    ctx.subscriptions.push(
      ctx.workspace.folder.subscribe(() => clearResults())
    )
  },

  deactivate() {
    bindContext(null)
    clearResults()
  },
}
