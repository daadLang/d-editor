import { FilePlus, FolderPlus, Files } from "lucide-react"

import type { Extension, ExtensionManifest } from "@/core/api"
import { Explorer } from "@/extensions/explorer/explorer"
// Transitional: the explorer still talks to the core store for file operations
// and dialogs. These move behind `ctx.workspace.fs` / `ctx.ui` in the next step.
import { collapseAllFolders, openDialog, refreshTree, useIdeStore } from "@/store/ide"

export const manifest: ExtensionManifest = {
  id: "explorer",
  name: "المستكشف",
  version: "0.1.0",
  description: "شجرة ملفات المجلد المفتوح",
}

const hasFolder = () => useIdeStore.getState().folder !== null

export const extension: Extension = {
  activate(ctx) {
    ctx.views.registerSidebarView({
      id: "explorer",
      title: "المستكشف",
      icon: Files,
      component: Explorer,
      order: 10,
      keybinding: "Mod+Shift+KeyE",
    })

    const withFolder = (run: (folder: string) => void) => () => {
      const folder = ctx.workspace.folder.get()
      if (folder) run(folder)
    }

    ctx.commands.register(
      "explorer.newFile",
      withFolder((dir) => openDialog({ kind: "new-file", dir })),
      { title: "ملف جديد", icon: FilePlus, when: hasFolder }
    )
    ctx.commands.register(
      "explorer.newFolder",
      withFolder((dir) => openDialog({ kind: "new-folder", dir })),
      { title: "مجلد جديد", icon: FolderPlus, when: hasFolder }
    )
    ctx.commands.register("explorer.refresh", refreshTree, {
      title: "تحديث المستكشف",
      when: hasFolder,
    })
    ctx.commands.register("explorer.collapseAll", collapseAllFolders, {
      title: "طي كل المجلدات",
      when: hasFolder,
    })
  },
}
