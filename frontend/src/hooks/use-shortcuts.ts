import { useEffect } from "react"

import { runKeybinding } from "@/core/commands"

/**
 * Global keyboard shortcuts. Every binding belongs to a command in the
 * registry (core or extension); keys are matched by `event.code` (physical
 * key) so they keep working when an Arabic keyboard layout is active.
 */
export function useShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      runKeybinding(event)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])
}
