import { useState } from "react"
import { Circle, Columns2, FileCode2, Rows2, Settings, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { isEditorDrag, readEditorDrag, startTabDrag } from "@/lib/tab-dnd"
import { cn } from "@/lib/utils"
import { useLayoutStore } from "@/store/layout"
import {
  activateTab,
  closeGroupTabs,
  closeOtherTabs,
  closeTab,
  moveTab,
  openFile,
  setActiveGroup,
  splitActiveGroup,
  useIdeStore,
  type Tab,
} from "@/store/ide"

interface EditorTabProps {
  tab: Tab
  groupId: string
  /** Id of the neighbouring group a tab can be sent to, if any. */
  otherGroupId: string | undefined
  dropping: boolean
  onDropTarget: (id: string | null) => void
}

function EditorTab({ tab, groupId, otherGroupId, dropping, onDropTarget }: EditorTabProps) {
  const dirty = tab.type === "file" && tab.dirty
  const Icon = tab.type === "settings" ? Settings : FileCode2

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          draggable
          className={cn(
            "group/tab relative flex h-full shrink-0 border-e",
            dropping && "before:absolute before:inset-y-0 before:start-0 before:z-10 before:w-0.5 before:bg-primary"
          )}
          onDragStart={(event) => startTabDrag(event, groupId, tab.id)}
          onDragOver={(event) => {
            if (!isEditorDrag(event)) return
            event.preventDefault()
            event.stopPropagation()
            onDropTarget(tab.id)
          }}
          onDrop={(event) => {
            const drag = readEditorDrag(event)
            onDropTarget(null)
            if (!drag) return
            event.preventDefault()
            event.stopPropagation()
            if (drag.kind === "tab") moveTab(drag.id, drag.groupId, groupId, tab.id)
            else void openFile(drag.path, groupId)
          }}
          // Middle click closes the tab, like most editors.
          onAuxClick={(event) => {
            if (event.button === 1) {
              event.preventDefault()
              void closeTab(tab.id, groupId)
            }
          }}
        >
          <TabsTrigger
            value={tab.id}
            title={tab.type === "file" ? tab.path : tab.title}
            className="h-full max-w-56 flex-none gap-2 rounded-none ps-3 pe-9 group-data-[orientation=horizontal]/tabs:after:bottom-0 data-[state=active]:bg-background"
          >
            <Icon className="text-muted-foreground" />
            <span className="filename">{tab.title}</span>
          </TabsTrigger>

          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`إغلاق ${tab.title}`}
            className="absolute end-1.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            onClick={() => void closeTab(tab.id, groupId)}
          >
            {dirty ? (
              <>
                <Circle className="size-2 fill-current group-hover/tab:hidden" />
                <X className="hidden group-hover/tab:block" />
              </>
            ) : (
              <X />
            )}
          </Button>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-52">
        <ContextMenuItem onSelect={() => void closeTab(tab.id, groupId)}>إغلاق</ContextMenuItem>
        <ContextMenuItem onSelect={() => void closeOtherTabs(tab.id, groupId)}>
          إغلاق التبويبات الأخرى
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void closeGroupTabs(groupId)}>
          إغلاق كل التبويبات في هذه المجموعة
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            activateTab(tab.id, groupId)
            splitActiveGroup()
          }}
        >
          تقسيم المحرر
        </ContextMenuItem>
        {otherGroupId && (
          <ContextMenuItem onSelect={() => moveTab(tab.id, groupId, otherGroupId)}>
            نقل إلى المجموعة المجاورة
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function EditorTabs({ groupId }: { groupId: string }) {
  const groups = useIdeStore((state) => state.groups)
  const allTabs = useIdeStore((state) => state.tabs)
  const active = useIdeStore((state) => state.activeGroupId === groupId)
  const orientation = useLayoutStore((state) => state.editorOrientation)
  const [dropId, setDropId] = useState<string | null>(null)
  const [overStrip, setOverStrip] = useState(false)

  const index = groups.findIndex((g) => g.id === groupId)
  const group = groups[index]
  if (!group) return null
  const tabs = group.tabIds
    .map((id) => allTabs.find((tab) => tab.id === id))
    .filter((tab): tab is Tab => Boolean(tab))
  const otherGroupId = (groups[index + 1] ?? groups[index - 1])?.id
  const SplitIcon = orientation === "horizontal" ? Columns2 : Rows2

  return (
    <div
      className={cn(
        "flex h-10 shrink-0 items-stretch border-b bg-card",
        overStrip && "bg-accent/40"
      )}
      onDragOver={(event) => {
        if (!isEditorDrag(event)) return
        event.preventDefault()
        event.stopPropagation() // the strip reorders; only the body splits
        setOverStrip(true)
      }}
      onDragLeave={() => {
        setOverStrip(false)
        setDropId(null)
      }}
      onDrop={(event) => {
        setOverStrip(false)
        const drag = readEditorDrag(event)
        if (!drag) return
        event.preventDefault()
        event.stopPropagation()
        if (drag.kind === "tab") moveTab(drag.id, drag.groupId, groupId)
        else void openFile(drag.path, groupId)
      }}
    >
      <Tabs
        value={group.activeId ?? ""}
        onValueChange={(id) => {
          setActiveGroup(groupId)
          activateTab(id, groupId)
        }}
        className="min-w-0 flex-1 gap-0"
      >
        <ScrollArea className="w-full">
          <TabsList
            variant="line"
            className={cn(
              "h-10 w-max justify-start gap-0 p-0",
              // The active group's selected tab gets the accent underline.
              !active && "opacity-80"
            )}
          >
            {tabs.map((tab) => (
              <EditorTab
                key={tab.id}
                tab={tab}
                groupId={groupId}
                otherGroupId={otherGroupId}
                dropping={dropId === tab.id}
                onDropTarget={setDropId}
              />
            ))}
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </Tabs>

      <div className="flex shrink-0 items-center border-s px-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="تقسيم المحرر"
              onClick={() => {
                setActiveGroup(groupId)
                splitActiveGroup()
              }}
            >
              <SplitIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>تقسيم المحرر</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
