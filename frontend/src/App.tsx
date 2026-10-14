import { useEffect } from "react"

import { AppDialogs } from "@/components/ide/dialogs"
import { CommandPalette } from "@/components/ide/command-palette"
import { Workbench } from "@/components/ide/workbench"
import { SidebarProvider } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { DirectionProvider } from "@/components/ui/direction"
import { useShortcuts } from "@/hooks/use-shortcuts"
import { api } from "@/lib/wails"
import { appendOutput, loadSettings } from "@/store/ide"

function Shell() {
  useShortcuts()

  return (
    <>
      <Workbench />
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
        {/* Only provides context for the explorer's menu components. */}
        <SidebarProvider className="h-full min-h-0">
          <Shell />
        </SidebarProvider>
        <Toaster position="bottom-left" dir="rtl" />
      </TooltipProvider>
    </DirectionProvider>
  )
}
