import type { DragEvent } from "react"

/**
 * Drag-and-drop between the explorer and the editor groups. Two things can be
 * dragged: an open tab, or a file from the explorer.
 */
const TAB = "application/x-daad-tab"
const FILE = "application/x-daad-file"

export type EditorDrag =
  | { kind: "tab"; groupId: string; id: string }
  | { kind: "file"; path: string }

/**
 * Browsers hide the payload until the drop, but the overlay needs to know what
 * is being dragged while it moves, so the drag is also remembered here.
 */
let active: EditorDrag | null = null
const clear = () => {
  active = null
}

function begin(event: DragEvent, type: string, drag: EditorDrag) {
  event.dataTransfer.setData(type, JSON.stringify(drag))
  event.dataTransfer.effectAllowed = "move"
  active = drag
  window.addEventListener("dragend", clear, { once: true })
  }

export const startTabDrag = (event: DragEvent, groupId: string, id: string) =>
  begin(event, TAB, { kind: "tab", groupId, id })

export const startFileDrag = (event: DragEvent, path: string) =>
  begin(event, FILE, { kind: "file", path })

/** True while a tab or explorer file (not text or an OS file) is dragged over. */
export const isEditorDrag = (event: DragEvent) =>
  event.dataTransfer.types.includes(TAB) || event.dataTransfer.types.includes(FILE)

/** The drag in progress, for use while it moves (before the payload is readable). */
export const peekDrag = () => active

/** The dropped item. Only readable inside `drop`. */
export function readEditorDrag(event: DragEvent): EditorDrag | null {
  for (const type of [TAB, FILE]) {
    const raw = event.dataTransfer.getData(type)
    if (!raw) continue
    try {
      const data = JSON.parse(raw)
      if (data?.kind === "tab" && typeof data.groupId === "string" && typeof data.id === "string") return data
      if (data?.kind === "file" && typeof data.path === "string") return data
    } catch {
      // not ours
    }
  }
  return null
}
