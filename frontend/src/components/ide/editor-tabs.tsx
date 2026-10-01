import { FileCode2, Settings, Circle, X } from "lucide-react"

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
import {
  activateTab,
  closeAllTabs,
  closeOtherTabs,
  closeTab,
  useIdeStore,
  type Tab,
} from "@/store/ide"

function EditorTab({ tab }: { tab: Tab }) {
  const dirty = tab.type === "file" && tab.dirty
  const Icon = tab.type === "settings" ? Settings : FileCode2

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className="group/tab relative flex h-full shrink-0 border-e"
          // Middle click closes the tab, like most editors.
          onAuxClick={(event) => {
            if (event.button === 1) {
              event.preventDefault()
              void closeTab(tab.id)
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
            onClick={() => void closeTab(tab.id)}
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

      <ContextMenuContent className="w-48">
        <ContextMenuItem onSelect={() => void closeTab(tab.id)}>إغلاق</ContextMenuItem>
        <ContextMenuItem onSelect={() => void closeOtherTabs(tab.id)}>
          إغلاق التبويبات الأخرى
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => void closeAllTabs()}>
          إغلاق الكل
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function EditorTabs() {
  const tabs = useIdeStore((state) => state.tabs)
  const activeId = useIdeStore((state) => state.activeId)

  return (
    <Tabs value={activeId ?? ""} onValueChange={activateTab} className="gap-0">
      <ScrollArea className="w-full border-b bg-card">
        <TabsList variant="line" className="h-10 w-max justify-start gap-0 p-0">
          {tabs.map((tab) => (
            <EditorTab key={tab.id} tab={tab} />
          ))}
        </TabsList>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </Tabs>
  )
}
