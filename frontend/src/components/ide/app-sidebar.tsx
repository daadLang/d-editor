import { FilePlus, FolderOpen, FolderPlus, Settings } from "lucide-react"

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
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { useLogo } from "@/hooks/use-logo"
import { basename } from "@/lib/path"
import { openDialog, openFolder, openSettings, useIdeStore } from "@/store/ide"

export function AppSidebar() {
  const folder = useIdeStore((state) => state.folder)
  const logo = useLogo()

  return (
    // In this RTL build `side="left"` is the logical *start*, i.e. the right edge.
    <Sidebar side="left">
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-2 py-1">
          <img src={logo} alt="" className="size-8 object-contain" />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">ض IDE</span>
            <span className="text-xs text-muted-foreground">لغة ضاد</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="bidi-plaintext">
            {folder ? basename(folder) : "المستكشف"}
          </SidebarGroupLabel>
          {folder && (
            <SidebarGroupAction
              title="ملف جديد"
              onClick={() => openDialog({ kind: "new-file", dir: folder })}
            >
              <FilePlus />
              <span className="sr-only">ملف جديد</span>
            </SidebarGroupAction>
          )}
          <SidebarGroupContent>
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
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
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
            <SidebarMenuButton onClick={openSettings}>
              <Settings />
              الإعدادات
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
