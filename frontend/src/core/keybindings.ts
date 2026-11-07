import { isMac } from "@/lib/platform"

/**
 * Keybindings are written with `KeyboardEvent.code` (the physical key), e.g.
 * `Mod+Shift+KeyP`, so they keep working when an Arabic layout is active.
 * `Mod` is Ctrl, or Cmd on macOS (either is accepted, as the IDE always did).
 */
export interface Keybinding {
  mod: boolean
  shift: boolean
  alt: boolean
  code: string
}

const MODIFIERS = new Set(["Mod", "Ctrl", "Shift", "Alt"])

export function parseKeybinding(text: string): Keybinding | null {
  const parts = text.split("+").map((part) => part.trim()).filter(Boolean)
  const code = parts.find((part) => !MODIFIERS.has(part))
  if (!code) return null
  return {
    mod: parts.includes("Mod") || parts.includes("Ctrl"),
    shift: parts.includes("Shift"),
    alt: parts.includes("Alt"),
    code,
  }
}

export function matchesKeybinding(binding: Keybinding, event: KeyboardEvent): boolean {
  return (
    event.code === binding.code &&
    (event.ctrlKey || event.metaKey) === binding.mod &&
    event.shiftKey === binding.shift &&
    event.altKey === binding.alt
  )
}

const CODE_LABELS: Record<string, string> = {
  Backquote: "`",
  Backslash: "\\",
  Slash: "/",
  Comma: ",",
  Period: ".",
  Minus: "-",
  Equal: "=",
}

const codeLabel = (code: string) =>
  CODE_LABELS[code] ?? code.replace(/^(Key|Digit)/, "")

/** Key names for display, e.g. `["Ctrl", "Shift", "P"]`. */
export function keybindingLabels(text: string): string[] {
  const binding = parseKeybinding(text)
  if (!binding) return []
  return [
    ...(binding.mod ? [isMac ? "⌘" : "Ctrl"] : []),
    ...(binding.alt ? [isMac ? "⌥" : "Alt"] : []),
    ...(binding.shift ? ["Shift"] : []),
    codeLabel(binding.code),
  ]
}
