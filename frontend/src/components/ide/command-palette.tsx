import {
  FilePlus,
  FolderOpen,
  FolderPlus,
  Palette,
  PanelLeft,
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
import { useSidebar } from "@/components/ui/sidebar"
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
  toggleOutput,
  updateSettings,
  useIdeStore,
} from "@/store/ide"

interface Action {
  label: string
  icon: ComponentType
  keys?: string[]
  run: () => void
}

export function CommandPalette() {
  const open = useIdeStore((state) => state.paletteOpen)
  const folder = useIdeStore((state) => state.folder)
  const { toggleSidebar } = useSidebar()

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
        ]
      : []),
    { label: "إظهار/إخفاء المستكشف", icon: PanelLeft, keys: [MOD, "B"], run: toggleSidebar },
    { label: "إظهار/إخفاء نافذة الإخراج", icon: TerminalSquare, keys: [MOD, "`"], run: toggleOutput },
    { label: "الإعدادات", icon: Settings, keys: [MOD, "P"], run: openSettings },
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
