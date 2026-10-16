import { useEffect, useRef } from "react"
import { useDefaultLayout, usePanelRef } from "react-resizable-panels"

import { EditorLayout } from "@/components/ide/editor-layout"
import { Explorer } from "@/components/ide/explorer"
import { MenuBar } from "@/components/ide/menu-bar"
import { OutputPanel } from "@/components/ide/output-panel"
import { StatusBar } from "@/components/ide/status-bar"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { setOutputOpen, useIdeStore } from "@/store/ide"
import { setSidebarOpen, useLayoutStore } from "@/store/layout"

/** Keeps a collapsible panel in step with an "open" flag in a store. */
function useCollapsibleSync(
  open: boolean,
  ref: ReturnType<typeof usePanelRef>,
  minPercent: number,
  restoreSize: string,
  deps: unknown[] = []
) {
  useEffect(() => {
    const panel = ref.current
    if (!panel) return
    if (open && panel.isCollapsed()) {
      panel.expand()
      // The first opening restores the minimum, which can be too small to use.
      if (panel.getSize().asPercentage < minPercent) panel.resize(restoreSize)
    }
    if (!open && !panel.isCollapsed()) panel.collapse()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ref, ...deps])
}

/** Editors plus the output panel, which can be docked to the bottom or side. */
function Center() {
  const position = useLayoutStore((state) => state.panelPosition)
  const outputOpen = useIdeStore((state) => state.output.open)
  const outputRef = usePanelRef()
  const ready = useRef(false)
  const bottom = position === "bottom"

  const panelIds = bottom ? ["editors", "output"] : ["output", "editors"]
  const id = `daad:center:${position}`
  const persisted = useDefaultLayout({ id, panelIds })

  useCollapsibleSync(outputOpen, outputRef, bottom ? 15 : 20, bottom ? "32%" : "35%", [
    position,
  ])
  // The group remounts when the dock position changes and briefly reports a
  // size of 0 while laying out; ignore that so it does not close the panel.
  const lastPosition = useRef(position)
  if (lastPosition.current !== position) {
    lastPosition.current = position
    ready.current = false
  }
  useEffect(() => {
    ready.current = true
  }, [position])

  const editors = (
    <ResizablePanel
      id="editors"
      defaultSize="100%"
      minSize="25%"
      className="min-h-0 min-w-0"
    >
      <EditorLayout />
    </ResizablePanel>
  )
  const output = (
    <ResizablePanel
      id="output"
      panelRef={outputRef}
      defaultSize="0%"
      minSize={bottom ? "15%" : "20%"}
      maxSize="70%"
      collapsible
      collapsedSize="0%"
      className="min-h-0 min-w-0"
      onResize={(size) => {
        if (!ready.current) return
        const open = size.asPercentage > 0
        if (open !== useIdeStore.getState().output.open) setOutputOpen(open)
      }}
    >
      <OutputPanel />
    </ResizablePanel>
  )

  return (
    <ResizablePanelGroup
      key={position}
      id={id}
      orientation={bottom ? "vertical" : "horizontal"}
      defaultLayout={persisted.defaultLayout}
      onLayoutChanged={persisted.onLayoutChanged}
      className="min-h-0 flex-1"
    >
      {bottom ? (
        <>
          {editors}
          <ResizableHandle />
          {output}
        </>
      ) : (
        <>
          {output}
          <ResizableHandle />
          {editors}
        </>
      )}
    </ResizablePanelGroup>
  )
}

/** The whole window: explorer panel on one side, everything else on the other. */
export function Workbench() {
  const sidebarOpen = useLayoutStore((state) => state.sidebarOpen)
  const resetCount = useLayoutStore((state) => state.resetCount)
  const sidebarRef = usePanelRef()
  const ready = useRef(false)
  const persisted = useDefaultLayout({
    id: "daad:main",
    panelIds: ["main", "sidebar"],
  })

  useCollapsibleSync(sidebarOpen, sidebarRef, 10, "280px")
  const lastReset = useRef(resetCount)
  if (lastReset.current !== resetCount) {
    lastReset.current = resetCount
    ready.current = false
  }
  useEffect(() => {
    ready.current = true
  }, [resetCount])

  return (
    <ResizablePanelGroup
      key={resetCount}
      id="daad:main"
      orientation="horizontal"
      defaultLayout={persisted.defaultLayout}
      onLayoutChanged={persisted.onLayoutChanged}
    >
      <ResizablePanel id="main" minSize="35%" className="min-w-0">
        <div className="flex h-full min-w-0 flex-col">
          <MenuBar />
          <Center key={resetCount} />
          <StatusBar />
        </div>
      </ResizablePanel>

      <ResizableHandle />

      <ResizablePanel
        id="sidebar"
        panelRef={sidebarRef}
        defaultSize="280px"
        minSize="200px"
        maxSize="50%"
        collapsible
        collapsedSize="0px"
        className="min-w-0"
        onResize={(size) => {
          if (!ready.current) return
          const open = size.asPercentage > 0
          if (open !== useLayoutStore.getState().sidebarOpen) setSidebarOpen(open)
        }}
      >
        <Explorer />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
