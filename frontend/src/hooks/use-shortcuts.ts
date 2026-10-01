import { useEffect } from "react"

import {
  runActive,
  saveActive,
  setPaletteOpen,
  toggleOutput,
  toggleSettings,
} from "@/store/ide"

/**
 * Global keyboard shortcuts. `event.code` (physical key) is used rather than
 * `event.key` so they keep working when an Arabic keyboard layout is active.
 * Ctrl+B (toggle explorer) is handled by the shadcn sidebar itself.
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
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])
}
