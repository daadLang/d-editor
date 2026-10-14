import { useEffect } from "react"

import { editorRegistry } from "@/lib/editor-registry"
import {
  closeTab,
  runActive,
  saveActive,
  setActiveGroup,
  setPaletteOpen,
  splitActiveGroup,
  toggleOutput,
  toggleSettings,
  useIdeStore,
} from "@/store/ide"
import { toggleSidebar } from "@/store/layout"

/**
 * Global keyboard shortcuts. `event.code` (physical key) is used rather than
 * `event.key` so they keep working when an Arabic keyboard layout is active.
 */
export function useShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "F5") {
        event.preventDefault()
        void runActive()
        return
      }

      if (!(event.ctrlKey || event.metaKey)) return

      switch (event.code) {
        case "KeyS":
          event.preventDefault()
          void saveActive()
          break
        case "KeyP":
          event.preventDefault()
          if (event.shiftKey) setPaletteOpen(true)
          else toggleSettings()
          break
        case "Backquote":
          event.preventDefault()
          toggleOutput()
          break
        case "KeyB":
          event.preventDefault()
          toggleSidebar()
          break
        case "Backslash":
          event.preventDefault()
          splitActiveGroup()
          break
        case "KeyW": {
          const { activeId } = useIdeStore.getState()
          if (activeId) {
            event.preventDefault()
            void closeTab(activeId)
          }
          break
        }
        case "Digit1":
        case "Digit2":
        case "Digit3": {
          // Focus the 1st/2nd/3rd editor group, in the order they are shown.
          const group = useIdeStore.getState().groups[Number(event.code.slice(5)) - 1]
          if (group) {
            event.preventDefault()
            setActiveGroup(group.id)
            editorRegistry.focus(group.id)
          }
          break
        }
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])
}
