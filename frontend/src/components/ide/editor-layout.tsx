import type { ReactNode } from "react"

import { EditorGroupView } from "@/components/ide/editor-group"
import { WelcomeView } from "@/components/ide/welcome-view"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { isEditorDrag, readEditorDrag } from "@/lib/tab-dnd"
import { openFile, useIdeStore, type LayoutNode } from "@/store/ide"

/** Renders the tree of editor groups; every split is its own resizable group. */
function LayoutView({ node }: { node: LayoutNode }) {
  if (node.type === "group") return <EditorGroupView groupId={node.id} />

  // Resizable groups run left-to-right, so a horizontal split lists its
  // children in screen order: the logical first child belongs on the right.
  const children =
    node.orientation === "horizontal" ? [...node.children].reverse() : node.children

  const items: ReactNode[] = []
  children.forEach((child, index) => {
    if (index > 0) items.push(<ResizableHandle key={`handle-${child.id}`} />)
    items.push(
      <ResizablePanel key={child.id} id={child.id} minSize="10%" className="min-h-0 min-w-0">
        <LayoutView node={child} />
      </ResizablePanel>
    )
  })

  return (
    <ResizablePanelGroup
      id={`daad:split:${node.id}`}
      orientation={node.orientation}
      className="min-h-0"
    >
      {items}
    </ResizablePanelGroup>
  )
}

/** The whole editing area: the welcome page until something is open. */
export function EditorLayout() {
  const layout = useIdeStore((state) => state.layout)
  const hasTabs = useIdeStore((state) => state.tabs.length > 0)

  if (hasTabs) return <LayoutView node={layout} />

  // Nothing is open yet: an explorer file can still be dropped to open it.
  return (
    <div
      className="h-full"
      onDragOver={(event) => isEditorDrag(event) && event.preventDefault()}
      onDrop={(event) => {
        const drag = readEditorDrag(event)
        if (drag?.kind !== "file") return
        event.preventDefault()
        void openFile(drag.path)
      }}
    >
      <WelcomeView />
    </div>
  )
}
