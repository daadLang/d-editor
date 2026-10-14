import {
  ChevronsDownUp,
  FilePlus,
  FolderOpen,
  FolderPlus,
  RefreshCw,
  Settings,
} from "lucide-react"

import { FileTree } from "@/components/ide/file-tree"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useLogo } from "@/hooks/use-logo"
import { basename } from "@/lib/path"
import {
  collapseAllFolders,
  openDialog,
  openFolder,
  openSettings,
  refreshTree,
  useIdeStore,
} from "@/store/ide"

function HeaderAction({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** The file explorer, shown in the resizable side panel. */
export function Explorer() {
  const folder = useIdeStore((state) => state.folder)
  const logo = useLogo()

  return (
    <aside className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex shrink-0 items-center gap-2.5 px-4 py-3">
        <img src={logo} alt="" className="size-8 object-contain" />
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">ض IDE</span>
          <span className="text-xs text-muted-foreground">لغة ضاد</span>
        </div>
      </div>

      <div className="flex h-8 shrink-0 items-center gap-1 ps-4 pe-2">
        <span className="bidi-plaintext min-w-0 flex-1 truncate text-xs font-medium text-sidebar-foreground/70">
          {folder ? basename(folder) : "المستكشف"}
        </span>
        {folder && (
          <>
            <HeaderAction
              label="ملف جديد"
              onClick={() => openDialog({ kind: "new-file", dir: folder })}
            >
              <FilePlus />
            </HeaderAction>
            <HeaderAction
              label="مجلد جديد"
              onClick={() => openDialog({ kind: "new-folder", dir: folder })}
            >
              <FolderPlus />
            </HeaderAction>
            <HeaderAction label="تحديث" onClick={refreshTree}>
              <RefreshCw />
            </HeaderAction>
            <HeaderAction label="طي كل المجلدات" onClick={collapseAllFolders}>
              <ChevronsDownUp />
            </HeaderAction>
          </>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-2 pb-2">
          {folder ? (
            <FileTree key={folder} root={folder} />
          ) : (
            <Empty className="border-none p-2">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderOpen />
                </EmptyMedia>
                <EmptyTitle className="text-base">لا يوجد مجلد مفتوح</EmptyTitle>
                <EmptyDescription>
                  افتح مجلدًا أو أنشئ مشروعًا جديدًا للبدء
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="sm" onClick={() => void openFolder()}>
                  <FolderOpen />
                  فتح مجلد
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openDialog({ kind: "new-project" })}
                >
                  <FolderPlus />
                  مشروع جديد
                </Button>
              </EmptyContent>
            </Empty>
          )}
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t p-2">
        <SidebarMenu>
          {folder && (
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => void openFolder()}>
                <FolderOpen />
                فتح مجلد آخر
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => openSettings()}>
              <Settings />
              الإعدادات
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </div>
    </aside>
  )
}
