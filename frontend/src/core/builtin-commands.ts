import {
  Columns2,
  Download,
  FolderOpen,
  FolderPlus,
  LayoutDashboard,
  PanelBottom,
  PanelRight,
  Play,
  Rows2,
  Save,
  Settings,
  TerminalSquare,
  XSquare,
} from "lucide-react"

import { registerCommand } from "@/core/commands"
import { editorRegistry } from "@/lib/editor-registry"
import {
  closeAllTabs,
  closeTab,
  flipEditorLayout,
  openDialog,
  openFolder,
  openSettings,
  runActive,
  saveActive,
  setActiveGroup,
  setPaletteOpen,
  splitActiveGroup,
  toggleOutput,
  toggleSettings,
  useIdeStore,
} from "@/store/ide"
import { resetLayout, togglePanelPosition, toggleSidebar } from "@/store/layout"

/**
 * The core's own commands. They go through the same registry extensions use,
 * which drives both the command palette and the keyboard shortcuts.
 */
export function registerBuiltinCommands() {
  registerCommand("run.active", () => runActive(), {
    title: "تشغيل الملف الحالي",
    icon: Play,
    keybinding: "F5",
  })
  registerCommand("file.save", () => saveActive(), {
    title: "حفظ",
    icon: Save,
    keybinding: "Mod+KeyS",
  })
  registerCommand("workspace.openFolder", () => openFolder(), {
    title: "فتح مجلد…",
    icon: FolderOpen,
  })
  registerCommand("workspace.newProject", () => openDialog({ kind: "new-project" }), {
    title: "مشروع جديد…",
    icon: FolderPlus,
  })

  registerCommand("workbench.toggleSidebar", toggleSidebar, {
    title: "إظهار/إخفاء الشريط الجانبي",
    icon: PanelRight,
    keybinding: "Mod+KeyB",
  })
  registerCommand("workbench.toggleOutput", toggleOutput, {
    title: "إظهار/إخفاء نافذة الإخراج",
    icon: TerminalSquare,
    keybinding: "Mod+Backquote",
  })
  registerCommand("workbench.splitEditor", splitActiveGroup, {
    title: "تقسيم المحرر",
    icon: Columns2,
    keybinding: "Mod+Backslash",
  })
  registerCommand("workbench.flipEditorLayout", flipEditorLayout, {
    title: "تبديل ترتيب المحررات (أفقي/عمودي)",
    icon: Rows2,
  })
  registerCommand("workbench.togglePanelPosition", togglePanelPosition, {
    title: "نقل نافذة الإخراج (أسفل/جانب)",
    icon: PanelBottom,
  })
  registerCommand("workbench.resetLayout", resetLayout, {
    title: "إعادة ضبط التخطيط",
    icon: LayoutDashboard,
  })
  registerCommand("workbench.closeAllTabs", () => closeAllTabs(), {
    title: "إغلاق كل التبويبات",
    icon: XSquare,
  })

  registerCommand("settings.open", () => openSettings(), {
    title: "الإعدادات",
    icon: Settings,
  })
  registerCommand("settings.openInterpreter", () => openSettings("interpreter"), {
    title: "تثبيت / اختيار مفسر ضاد",
    icon: Download,
  })
  // The shortcut toggles; the palette entry above only opens.
  registerCommand("settings.toggle", toggleSettings, { keybinding: "Mod+KeyP" })
  registerCommand("palette.open", () => setPaletteOpen(true), {
    keybinding: "Mod+Shift+KeyP",
  })

  registerCommand(
    "tab.closeActive",
    () => {
      const { activeId } = useIdeStore.getState()
      // No tab: leave Ctrl+W to the webview.
      if (!activeId) return false
      return closeTab(activeId)
    },
    { keybinding: "Mod+KeyW" }
  )

  // Focus the 1st/2nd/3rd editor group, in the order they are shown.
  for (const index of [1, 2, 3]) {
    registerCommand(
      `editor.focusGroup${index}`,
      () => {
        const group = useIdeStore.getState().groups[index - 1]
        if (!group) return false
        setActiveGroup(group.id)
        editorRegistry.focus(group.id)
      },
      { keybinding: `Mod+Digit${index}` }
    )
  }
}
