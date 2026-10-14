import {
  FilePlus,
  FolderOpen,
  FolderPlus,
  Palette,
  PanelBottom,
  PanelRight,
  Columns2,
  Rows2,
  LayoutDashboard,
  Download,
  Play,
  Save,
  Settings,
  TerminalSquare,
  XSquare,
} from "lucide-react"
import type { ComponentType } from "react"

import { Shortcut } from "@/components/ide/shortcut"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { MOD } from "@/lib/platform"
import { THEMES } from "@/lib/themes"
import {
  closeAllTabs,
  openDialog,
  openFolder,
  openSettings,
  runActive,
  saveActive,
  setPaletteOpen,
  flipEditorLayout,
  splitActiveGroup,
  toggleOutput,
  updateSettings,
  useIdeStore,
} from "@/store/ide"
import {
  resetLayout,
  togglePanelPosition,
  toggleSidebar,
} from "@/store/layout"

interface Action {
  label: string
  icon: ComponentType
  keys?: string[]
  run: () => void
}

export function CommandPalette() {
  const open = useIdeStore((state) => state.paletteOpen)
  const folder = useIdeStore((state) => state.folder)

  const actions: Action[] = [
    { label: "تشغيل الملف الحالي", icon: Play, keys: ["F5"], run: () => void runActive() },
    { label: "حفظ", icon: Save, keys: [MOD, "S"], run: () => void saveActive() },
    { label: "فتح مجلد…", icon: FolderOpen, run: () => void openFolder() },
    { label: "مشروع جديد…", icon: FolderPlus, run: () => openDialog({ kind: "new-project" }) },
    ...(folder
      ? [
          {
            label: "ملف جديد",
            icon: FilePlus,
            run: () => openDialog({ kind: "new-file", dir: folder }),
          },
          {
            label: "مجلد جديد",
            icon: FolderPlus,
            run: () => openDialog({ kind: "new-folder", dir: folder }),
          },
        ]
      : []),
    { label: "إظهار/إخفاء المستكشف", icon: PanelRight, keys: [MOD, "B"], run: toggleSidebar },
    { label: "إظهار/إخفاء نافذة الإخراج", icon: TerminalSquare, keys: [MOD, "`"], run: toggleOutput },
    { label: "تقسيم المحرر", icon: Columns2, keys: [MOD, "\\"], run: splitActiveGroup },
    { label: "تبديل ترتيب المحررات (أفقي/عمودي)", icon: Rows2, run: flipEditorLayout },
    { label: "نقل نافذة الإخراج (أسفل/جانب)", icon: PanelBottom, run: togglePanelPosition },
    { label: "إعادة ضبط التخطيط", icon: LayoutDashboard, run: resetLayout },
    { label: "تثبيت / اختيار مفسر ضاد", icon: Download, run: () => openSettings("interpreter") },
    { label: "الإعدادات", icon: Settings, keys: [MOD, "P"], run: () => openSettings() },
    { label: "إغلاق كل التبويبات", icon: XSquare, run: () => void closeAllTabs() },
  ]

  // Run after the dialog has closed so focus returns to the right place.
  const choose = (run: () => void) => {
    setPaletteOpen(false)
    setTimeout(run, 0)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setPaletteOpen}
      title="لوحة الأوامر"
      description="ابحث عن أمر لتنفيذه"
    >
      <CommandInput placeholder="اكتب اسم أمر أو مظهر…" />
      <CommandList>
        <CommandEmpty>لا توجد نتائج.</CommandEmpty>
        <CommandGroup heading="الأوامر">
          {actions.map(({ label, icon: Icon, keys, run }) => (
            <CommandItem key={label} value={label} onSelect={() => choose(run)}>
              <Icon />
              {label}
              {keys && (
                <span className="ms-auto">
                  <Shortcut keys={keys} />
                </span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="تغيير المظهر">
          <CommandItem
            value="مظهر افتراضي ضاد"
            onSelect={() => choose(() => void updateSettings({ theme: "" }))}
          >
            <Palette />
            افتراضي (ضاد، يتبع نمط النظام)
          </CommandItem>
          {THEMES.map((theme) => (
            <CommandItem
              key={theme.key}
              value={`مظهر ${theme.label}`}
              onSelect={() => choose(() => void updateSettings({ theme: theme.key }))}
            >
              <Palette />
              <span dir="ltr">{theme.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
