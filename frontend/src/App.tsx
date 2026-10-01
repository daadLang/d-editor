import { useEffect } from "react"
import { usePanelRef } from "react-resizable-panels"

import { AppDialogs } from "@/components/ide/dialogs"
import { AppSidebar } from "@/components/ide/app-sidebar"
import { CodeEditor } from "@/components/ide/code-editor"
import { CommandPalette } from "@/components/ide/command-palette"
import { EditorTabs } from "@/components/ide/editor-tabs"
import { MenuBar } from "@/components/ide/menu-bar"
import { OutputPanel } from "@/components/ide/output-panel"
import { SettingsView } from "@/components/ide/settings-view"
import { StatusBar } from "@/components/ide/status-bar"
import { WelcomeView } from "@/components/ide/welcome-view"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { DirectionProvider } from "@/components/ui/direction"
import { useShortcuts } from "@/hooks/use-shortcuts"
import { api } from "@/lib/wails"
import {
  appendOutput,
  loadSettings,
  selectActiveTab,
  setOutputOpen,
  useIdeStore,
} from "@/store/ide"

function Workspace() {
  const activeTab = useIdeStore(selectActiveTab)
  const hasTabs = useIdeStore((state) => state.tabs.length > 0)
  const outputOpen = useIdeStore((state) => state.output.open)
  const outputRef = usePanelRef()

  // Keep the resizable panel in step with the store (shortcut, menu, run).
  useEffect(() => {
    const panel = outputRef.current
    if (!panel) return
    if (outputOpen && panel.isCollapsed()) {
      panel.expand()
      // First opening restores the 15% minimum, which is too short to read.
      if (panel.getSize().asPercentage < 25) panel.resize("32%")
    }
    if (!outputOpen && !panel.isCollapsed()) panel.collapse()
  }, [outputOpen, outputRef])

  const showEditor = activeTab?.type === "file"

  return (
    <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
      <ResizablePanel defaultSize="100%" minSize="25%" className="min-h-0">
        <div className="flex h-full min-h-0 flex-col">
          {hasTabs && <EditorTabs />}
          <div className="min-h-0 flex-1">
            <CodeEditor tab={showEditor ? activeTab : undefined} />
            {activeTab?.type === "settings" && <SettingsView />}
            {!activeTab && <WelcomeView />}
          </div>
        </div>
      </ResizablePanel>

      <ResizableHandle />

      <ResizablePanel
        panelRef={outputRef}
        defaultSize="0%"
        minSize="15%"
        maxSize="70%"
        collapsible
        collapsedSize="0%"
        onResize={(size) => {
          const open = size.asPercentage > 0
          if (open !== useIdeStore.getState().output.open) setOutputOpen(open)
        }}
      >
        <OutputPanel />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

function Shell() {
  useShortcuts()

  return (
    <>
      <AppSidebar />
      <SidebarInset className="min-w-0 overflow-hidden">
        <MenuBar />
        <Workspace />
        <StatusBar />
      </SidebarInset>
      <CommandPalette />
      <AppDialogs />
    </>
  )
}

export default function App() {
  useEffect(() => {
    void loadSettings()
    // Interpreter output is streamed from Go while `RunDaad` is awaiting.
    return api.onDaadOutput((event) => appendOutput(event.type, event.data))
  }, [])

  return (
    <DirectionProvider dir="rtl">
      <TooltipProvider delayDuration={300}>
        <SidebarProvider className="h-full">
          <Shell />
        </SidebarProvider>
        <Toaster position="bottom-left" dir="rtl" />
      </TooltipProvider>
    </DirectionProvider>
  )
}
