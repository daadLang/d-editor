import type { EditorState } from "@codemirror/state"
import type { EditorView } from "@codemirror/view"

/**
 * Holds the CodeMirror state of every open file. Keeping the whole
 * `EditorState` (not just the text) preserves undo history, selection and
 * scroll anchors when the user switches tabs.
 */
const states = new Map<string, EditorState>()
let view: EditorView | null = null
let shownId: string | null = null

export const editorRegistry = {
  attach(next: EditorView) {
    view = next
  },

  detach() {
    view = null
    shownId = null
  },

  /** Displays the document for `id`, creating its state on first use. */
  show(id: string, create: () => EditorState) {
    if (!view) return
    if (shownId === id) return
    if (shownId) states.set(shownId, view.state)
    view.setState(states.get(id) ?? create())
    shownId = id
  },

  isShowing(id: string) {
    return shownId === id
  },

  /** Current text of a tab, whether or not it is the visible one. */
  getText(id: string): string | undefined {
    if (view && shownId === id) return view.state.doc.toString()
    return states.get(id)?.doc.toString()
  },

  discard(id: string) {
    states.delete(id)
    if (shownId === id) shownId = null
  },

  rekey(from: string, to: string) {
    const state = states.get(from)
    if (state) {
      states.delete(from)
      states.set(to, state)
    }
    if (shownId === from) shownId = to
  },
}
