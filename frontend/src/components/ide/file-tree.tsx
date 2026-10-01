import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  ChevronDown,
  ChevronLeft,
  Copy,
  File,
  FileCode2,
  FilePlus,
  Folder,
  FolderOpen,
  Pencil,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
} from "@/components/ui/sidebar"
import { api, errorMessage, type FileEntry } from "@/lib/wails"
import { openDialog, openFile, useIdeStore } from "@/store/ide"

function sortEntries(entries: FileEntry[]) {
  return entries
    .filter((entry) => !entry.name.startsWith("."))
    .sort((a, b) =>
      a.isDirectory !== b.isDirectory
        ? a.isDirectory
          ? -1
          : 1
        : a.name.localeCompare(b.name, "ar")
    )
}

/** Loads a directory, reloading whenever the file system changed. */
function useDirectory(path: string, enabled: boolean) {
  const treeVersion = useIdeStore((state) => state.treeVersion)
  const [entries, setEntries] = useState<FileEntry[] | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    api
      .readDirectory(path)
      .then((list) => !cancelled && setEntries(sortEntries(list)))
      .catch((error) => {
        if (cancelled) return
        setEntries([])
        toast.error(`تعذر قراءة المجلد: ${errorMessage(error)}`)
      })
    return () => {
      cancelled = true
    }
  }, [path, enabled, treeVersion])

  return entries
}

function EntryMenu({ entry, children }: { entry: FileEntry; children: ReactNode }) {
  // A dialog opened while the menu is still animating out loses focus to the
  // menu's focus scope. So the follow-up action is queued and run from
  // `onCloseAutoFocus`, which Radix fires once the menu is fully closed.
  const pending = useRef<(() => void) | null>(null)
  const afterClose = (action: () => void) => () => {
    pending.current = action
  }

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(entry.path)
      toast.success("تم نسخ المسار", { duration: 1500 })
    } catch {
      toast.error("تعذر نسخ المسار")
    }
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent
        className="w-48"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          const action = pending.current
          pending.current = null
          action?.()
        }}
      >
        {entry.isDirectory && (
          <ContextMenuItem
            onSelect={afterClose(() => openDialog({ kind: "new-file", dir: entry.path }))}
          >
            <FilePlus />
            ملف جديد
          </ContextMenuItem>
        )}
        <ContextMenuItem onSelect={afterClose(() => openDialog({ kind: "rename", entry }))}>
          <Pencil />
          إعادة تسمية
        </ContextMenuItem>
        <ContextMenuItem onSelect={copyPath}>
          <Copy />
          نسخ المسار
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onSelect={afterClose(() => openDialog({ kind: "delete", entry }))}
        >
          <Trash2 />
          حذف
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function FileNode({ entry }: { entry: FileEntry }) {
  const active = useIdeStore((state) => state.activeId === entry.path)
  const Icon = entry.name.endsWith(".daad") ? FileCode2 : File

  return (
    <SidebarMenuItem>
      <EntryMenu entry={entry}>
        <SidebarMenuButton isActive={active} onClick={() => void openFile(entry.path)}>
          <Icon />
          <span className="filename">{entry.name}</span>
        </SidebarMenuButton>
      </EntryMenu>
    </SidebarMenuItem>
  )
}

function FolderNode({ entry }: { entry: FileEntry }) {
  const [open, setOpen] = useState(false)
  const children = useDirectory(entry.path, open)

  return (
    <SidebarMenuItem>
      <Collapsible open={open} onOpenChange={setOpen}>
        <EntryMenu entry={entry}>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton>
              {open ? <ChevronDown /> : <ChevronLeft />}
              {open ? <FolderOpen /> : <Folder />}
              <span className="filename">{entry.name}</span>
            </SidebarMenuButton>
          </CollapsibleTrigger>
        </EntryMenu>
        <CollapsibleContent>
          <SidebarMenuSub>
            {children === null && <SidebarMenuSkeleton />}
            {children?.length === 0 && (
              <li className="px-2 py-1 text-xs text-muted-foreground">
                المجلد فارغ
              </li>
            )}
            {children?.map((child) => (
              <TreeNode key={child.path} entry={child} />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  )
}

function TreeNode({ entry }: { entry: FileEntry }) {
  return entry.isDirectory ? <FolderNode entry={entry} /> : <FileNode entry={entry} />
}

export function FileTree({ root }: { root: string }) {
  const entries = useDirectory(root, true)

  if (entries === null) {
    return (
      <SidebarMenu>
        {Array.from({ length: 4 }, (_, index) => (
          <SidebarMenuItem key={index}>
            <SidebarMenuSkeleton showIcon />
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    )
  }

  if (entries.length === 0) {
    return <p className="px-2 py-1 text-xs text-muted-foreground">المجلد فارغ</p>
  }

  return (
    <SidebarMenu>
      {entries.map((entry) => (
        <TreeNode key={entry.path} entry={entry} />
      ))}
    </SidebarMenu>
  )
}
