export const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)

/** Label of the primary modifier key as shown in shortcut hints. */
export const MOD = isMac ? "⌘" : "Ctrl"
