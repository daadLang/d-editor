import { Play, Save } from "lucide-react"

import { Shortcut } from "@/components/ide/shortcut"
import { Button } from "@/components/ui/button"
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@/components/ui/menubar"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { MOD } from "@/lib/platform"
import {
  closeAllTabs,
  openDialog,
  openFolder,
  openSettings,
  runActive,
  saveActive,
  selectActiveTab,
  setPaletteOpen,
  toggleOutput,
  useIdeStore,
} from "@/store/ide"

function Keys({ keys }: { keys: string[] }) {
  return <MenubarShortcut dir="ltr">{keys.join("+")}</MenubarShortcut>
}

export function MenuBar() {
  const folder = useIdeStore((state) => state.folder)
  const activeTab = useIdeStore(selectActiveTab)
  const running = useIdeStore((state) => state.output.running)
  const { toggleSidebar } = useSidebar()

  const isFile = activeTab?.type === "file"
  const canSave = isFile && activeTab.dirty

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b bg-card px-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <SidebarTrigger />
        </TooltipTrigger>
        <TooltipContent>
          إظهار/إخفاء المستكشف <Shortcut keys={[MOD, "B"]} />
        </TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-5" />

      <Menubar className="border-none bg-transparent shadow-none">
        <MenubarMenu>
          <MenubarTrigger>ملف</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onSelect={() => openDialog({ kind: "new-project" })}>
              مشروع جديد…
            </MenubarItem>
            <MenubarItem onSelect={() => void openFolder()}>فتح مجلد…</MenubarItem>
            <MenubarItem
              disabled={!folder}
              onSelect={() => folder && openDialog({ kind: "new-file", dir: folder })}
            >
              ملف جديد…
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem disabled={!canSave} onSelect={() => void saveActive()}>
              حفظ <Keys keys={[MOD, "S"]} />
            </MenubarItem>
            <MenubarItem disabled={!activeTab} onSelect={() => void closeAllTabs()}>
              إغلاق كل التبويبات
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>عرض</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onSelect={() => setPaletteOpen(true)}>
              لوحة الأوامر <Keys keys={[MOD, "Shift", "P"]} />
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onSelect={toggleSidebar}>
              المستكشف <Keys keys={[MOD, "B"]} />
            </MenubarItem>
            <MenubarItem onSelect={toggleOutput}>
              نافذة الإخراج <Keys keys={[MOD, "`"]} />
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onSelect={openSettings}>
              الإعدادات <Keys keys={[MOD, "P"]} />
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>تشغيل</MenubarTrigger>
          <MenubarContent>
            <MenubarItem disabled={!isFile || running} onSelect={() => void runActive()}>
              تشغيل الملف الحالي <Keys keys={["F5"]} />
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      <div className="ms-auto flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="حفظ"
              disabled={!canSave}
              onClick={() => void saveActive()}
            >
              <Save />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            حفظ <Shortcut keys={[MOD, "S"]} />
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              disabled={!isFile || running}
              onClick={() => void runActive()}
            >
              {running ? <Spinner /> : <Play />}
              تشغيل
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            تشغيل <Shortcut keys={["F5"]} />
          </TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}

