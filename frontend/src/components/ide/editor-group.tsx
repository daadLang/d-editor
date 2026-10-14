import { useEffect, useRef, useState, type DragEvent } from "react"

import { CodeEditor } from "@/components/ide/code-editor"
import { EditorTabs } from "@/components/ide/editor-tabs"
import { SettingsView } from "@/components/ide/settings-view"
import { zoneAt, zoneBox, type DropZone } from "@/lib/drop-zone"
import { isEditorDrag, peekDrag, readEditorDrag, type EditorDrag } from "@/lib/tab-dnd"
import { cn } from "@/lib/utils"
import {
  dropFileOnEdge,
  dropTabOnEdge,
  moveTab,
  openFile,
  setActiveGroup,
  useIdeStore,
  type FileTab,
} from "@/store/ide"

/**
 * One editor area: its own tab strip plus the view of its active tab.
 *
 * Tabs and explorer files can be dropped on it, VS Code style: the middle
 * shows the item in this group, and each edge opens it in a new group on that
 * side. A highlighted box previews the result while dragging.
 */
export function EditorGroupView({ groupId }: { groupId: string }) {
  const group = useIdeStore((state) => state.groups.find((g) => g.id === groupId))
  const tab = useIdeStore((state) =>
    state.tabs.find((t) => t.id === group?.activeId)
  )
  const multiple = useIdeStore((state) => state.groups.length > 1)
  const active = useIdeStore((state) => state.activeGroupId === groupId)
  const [zone, setZone] = useState<DropZone | null>(null)
  // dragenter/dragleave also fire for every child element; count them so the
  // preview only goes away when the pointer really leaves the group.
  const depth = useRef(0)

  // Never leave a preview behind if the drag ends somewhere else. (`dragend`
  // fires after the drop, so it cannot race with the drop handler itself.)
  useEffect(() => {
    const reset = () => {
      depth.current = 0
      setZone(null)
    }
    window.addEventListener("dragend", reset)
    return () => window.removeEventListener("dragend", reset)
  }, [])

  if (!group) return null
  const fileTab: FileTab | undefined = tab?.type === "file" ? tab : undefined

  /**
   * Where the pointer is, or null when nothing can be dropped there: a group's
   * only tab dropped on its own edges would change nothing.
   */
  const zoneFor = (event: DragEvent<HTMLDivElement>, drag: EditorDrag | null) => {
    const next = zoneAt(event.currentTarget.getBoundingClientRect(), event.clientX, event.clientY)
    const pointless =
      next !== "center" &&
      drag?.kind === "tab" &&
      drag.groupId === groupId &&
      group.tabIds.length === 1
    return pointless ? null : next
  }

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!isEditorDrag(event)) return
    const next = zoneFor(event, peekDrag())
    if (next) {
      event.preventDefault()
      event.dataTransfer.dropEffect = "move"
    }
    if (next !== zone) setZone(next)
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    const drag = readEditorDrag(event)
    // Recomputed from the pointer rather than taken from state, which other
    // listeners may already have reset.
    const target = drag ? zoneFor(event, drag) : null
    depth.current = 0
    setZone(null)
    if (!drag || !target) return
    event.preventDefault()
    // Keep CodeMirror from also handling the drop.
    event.stopPropagation()

    if (target === "center") {
      if (drag.kind === "tab") moveTab(drag.id, drag.groupId, groupId)
      else void openFile(drag.path, groupId)
    } else if (drag.kind === "tab") {
      dropTabOnEdge(drag.id, drag.groupId, groupId, target)
    } else {
      void dropFileOnEdge(drag.path, groupId, target)
    }
  }

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 flex-col",
        // Outline the focused group only when there is something to tell apart.
        multiple && active && "shadow-[inset_0_2px_0_0_var(--primary)]"
      )}
      onMouseDownCapture={() => setActiveGroup(groupId)}
      // Capture phase so the preview also works over the CodeMirror editor.
      onDragEnterCapture={(event) => {
        if (isEditorDrag(event)) depth.current += 1
      }}
      onDragLeaveCapture={(event) => {
        if (!isEditorDrag(event)) return
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) setZone(null)
      }}
      onDragOverCapture={onDragOver}
      onDropCapture={onDrop}
    >
      <EditorTabs groupId={groupId} />
      <div className="relative min-h-0 flex-1">
        <CodeEditor groupId={groupId} tab={fileTab} />
        {tab?.type === "settings" && <SettingsView />}
      </div>

      {zone && (
        <div
          aria-hidden
          data-drop-zone={zone}
          style={zoneBox(zone)}
          className="pointer-events-none absolute z-30 rounded-sm border-2 border-primary/70 bg-primary/15 transition-all duration-100"
        />
      )}
    </div>
  )
}
