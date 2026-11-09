import {
  Annotation,
  Transaction,
  type ChangeSet,
  EditorState,
} from "@codemirror/state"
import { EditorView } from "@codemirror/view"

/**
 * Holds the CodeMirror state of every open editor.
 *
 * Each editor group owns one `EditorView`. For every (group, file) pair the
 * whole `EditorState` is kept, not just the text, so undo history and
 * selection survive tab switches, and even a group's editor being remounted
 * when the layout around it changes. States do not depend on any component,
 * so they can also move between groups.
 *
 * When the same file is open in more than one group, edits made in one are
 * replayed into the others (`broadcast`) so the views never drift apart.
 */

/** A place in a file: 1-based line and column (UTF-16 units), optional length. */
export interface RevealTarget {
  line: number
  column: number
  length?: number
}

/** Reveals waiting for a file to be shown in its group (see `revealAt`). */
const pendingReveals = new Map<string, RevealTarget>()

/**
 * Text of files that are open but not shown in any group yet, changed by
 * `applyEdits`. `getText` returns it, so showing or saving the file uses it.
 */
const staged = new Map<string, string>()

function applyReveal(view: EditorView, target: RevealTarget) {
  const { doc } = view.state
  const line = doc.line(Math.min(Math.max(target.line, 1), doc.lines))
  const from = Math.min(line.from + Math.max(target.column - 1, 0), line.to)
  const to = Math.min(from + Math.max(target.length ?? 0, 0), line.to)
  view.dispatch({
    selection: { anchor: from, head: to },
    effects: EditorView.scrollIntoView(from, { y: "center" }),
  })
  view.focus()
}

/** Marks transactions that were replayed from another view of the same file. */
export const remoteSync = Annotation.define<boolean>()

interface GroupView {
  view: EditorView
  shownId: string | null
  /** The group no longer exists; nothing of it must be kept. */
  dead: boolean
}

const SEP = "\u0000"
const key = (groupId: string, fileId: string) => `${groupId}${SEP}${fileId}`
const fileOf = (k: string) => k.slice(k.indexOf(SEP) + 1)
const groupOf = (k: string) => k.slice(0, k.indexOf(SEP))

const states = new Map<string, EditorState>()
const views = new Map<string, GroupView>()
/**
 * Full state of files whose last holder let go of them (the tab was moved to
 * another group). The group that shows the file next adopts it.
 */
const orphans = new Map<string, EditorState>()

function heldElsewhere(groupId: string, fileId: string) {
  for (const [id, entry] of views) {
    if (id !== groupId && entry.shownId === fileId) return true
  }
  for (const k of states.keys()) {
    if (fileOf(k) === fileId && groupOf(k) !== groupId) return true
  }
  return false
}

/** Keeps the live view's state in the map before it is replaced. */
function stash(groupId: string) {
  const entry = views.get(groupId)
  if (entry?.shownId) states.set(key(groupId, entry.shownId), entry.view.state)
}

export const editorRegistry = {
  attach(groupId: string, view: EditorView) {
    views.set(groupId, { view, shownId: null, dead: false })
  },

  /** A group's editor unmounted; its states stay for a possible remount. */
  detach(groupId: string) {
    const entry = views.get(groupId)
    if (entry && !entry.dead) stash(groupId)
    views.delete(groupId)
  },

  /** The group was removed from the layout for good. */
  forgetGroup(groupId: string) {
    const entry = views.get(groupId)
    if (entry) {
      entry.dead = true
      entry.shownId = null
    }
    for (const k of [...states.keys()]) {
      if (groupOf(k) === groupId) states.delete(k)
    }
  },

  /** Which group and file a live view currently shows. */
  infoFor(view: EditorView): { groupId: string; fileId: string | null } | null {
    for (const [groupId, entry] of views) {
      if (entry.view === view) return { groupId, fileId: entry.shownId }
    }
    return null
  },

  /**
   * Displays `fileId` in a group. A (group, file) pair that has no state yet
   * adopts an orphaned one, else starts from the text the file currently has
   * in any other group, falling back to `saved`.
   */
  show(
    groupId: string,
    fileId: string,
    saved: string,
    create: (doc: string) => EditorState
  ) {
    const entry = views.get(groupId)
    if (!entry || entry.shownId === fileId) return
    stash(groupId)

    let next = states.get(key(groupId, fileId))
    if (!next) {
      next = orphans.get(fileId)
      orphans.delete(fileId)
    }
    next ??= create(editorRegistry.getText(fileId) ?? saved)

    entry.view.setState(next)
    entry.shownId = fileId
    const pending = pendingReveals.get(fileId)
    if (pending) {
      pendingReveals.delete(fileId)
      applyReveal(entry.view, pending)
      return
    }
    // setState resets the scroll position; bring the cursor back into view.
    entry.view.dispatch({
      effects: EditorView.scrollIntoView(next.selection.main.head, { y: "center" }),
    })
  },

  /**
   * Selects a range and scrolls to it. When the group is not showing the file
   * yet (it was just opened), the reveal runs as soon as `show` displays it.
   */
  revealAt(groupId: string, fileId: string, target: RevealTarget) {
    const entry = views.get(groupId)
    if (entry && entry.shownId === fileId) applyReveal(entry.view, target)
    else pendingReveals.set(fileId, target)
  },

  focus(groupId: string) {
    views.get(groupId)?.view.focus()
  },

  isShowing(groupId: string, fileId: string) {
    return views.get(groupId)?.shownId === fileId
  },

  /** Current text of a file, whichever group holds it. */
  getText(fileId: string): string | undefined {
    for (const { view, shownId } of views.values()) {
      if (shownId === fileId) return view.state.doc.toString()
    }
    for (const [k, state] of states) {
      if (fileOf(k) === fileId) return state.doc.toString()
    }
    return orphans.get(fileId)?.doc.toString() ?? staged.get(fileId)
  },

  /**
   * Applies replacements (1-based line/column in UTF-16 units, relative to the
   * text as it is now) to an open file as ordinary, undoable edits. Returns
   * false when the file is not open anywhere.
   */
  applyEdits(
    fileId: string,
    edits: { line: number; column: number; length: number; text: string }[],
    /** Text of the file when no editor holds it yet (the tab's saved text). */
    fallbackText?: string
  ): boolean {
    const toChanges = (doc: EditorState["doc"]) =>
      edits.map((e) => {
        const line = doc.line(Math.min(Math.max(e.line, 1), doc.lines))
        const from = Math.min(line.from + e.column - 1, line.to)
        return { from, to: Math.min(from + e.length, line.to), insert: e.text }
      })

    // A live view: its update listener marks the file dirty and replays the
    // change into every other view of the file.
    for (const { view, shownId } of views.values()) {
      if (shownId !== fileId) continue
      view.dispatch({ changes: toChanges(view.state.doc), userEvent: "input.replace" })
      return true
    }
    let applied = false
    for (const [k, state] of states) {
      if (fileOf(k) !== fileId) continue
      states.set(k, state.update({ changes: toChanges(state.doc), userEvent: "input.replace" }).state)
      applied = true
    }
    const orphan = orphans.get(fileId)
    if (orphan) {
      orphans.set(fileId, orphan.update({ changes: toChanges(orphan.doc), userEvent: "input.replace" }).state)
      applied = true
    }
    if (!applied && fallbackText !== undefined) {
      const base = staged.get(fileId) ?? fallbackText
      const doc = EditorState.create({ doc: base }).doc
      staged.set(
        fileId,
        EditorState.create({ doc: base }).update({ changes: toChanges(doc) }).state.doc.toString()
      )
      applied = true
    }
    return applied
  },

  /** Replays a change made in `groupId` into every other view of the file. */
  broadcast(groupId: string, fileId: string, changes: ChangeSet) {
    const annotations = [remoteSync.of(true), Transaction.addToHistory.of(false)]
    for (const [id, entry] of views) {
      if (id !== groupId && entry.shownId === fileId) {
        entry.view.dispatch({ changes, annotations })
      }
    }
    for (const [k, state] of states) {
      const owner = groupOf(k)
      if (fileOf(k) !== fileId || owner === groupId) continue
      if (views.get(owner)?.shownId === fileId) continue // handled above
      states.set(k, state.update({ changes, annotations }).state)
    }
  },

  /**
   * A group stops showing a file that lives on elsewhere (the tab was moved).
   * If this group held the only live copy, its whole state is kept for the
   * group that shows the file next, so unsaved edits and undo history survive.
   */
  release(groupId: string, fileId: string) {
    const entry = views.get(groupId)
    const state =
      entry?.shownId === fileId ? entry.view.state : states.get(key(groupId, fileId))
    if (state && !heldElsewhere(groupId, fileId)) orphans.set(fileId, state)
    states.delete(key(groupId, fileId))
    if (entry?.shownId === fileId) entry.shownId = null
  },

  /** Forgets one file in one group (its tab was closed there). */
  discardInGroup(groupId: string, fileId: string) {
    states.delete(key(groupId, fileId))
    const entry = views.get(groupId)
    if (entry?.shownId === fileId) entry.shownId = null
  },

  /** Forgets a file everywhere (it was closed, deleted or renamed away). */
  discard(fileId: string) {
    orphans.delete(fileId)
    pendingReveals.delete(fileId)
    staged.delete(fileId)
    for (const k of [...states.keys()]) if (fileOf(k) === fileId) states.delete(k)
    for (const entry of views.values()) {
      if (entry.shownId === fileId) entry.shownId = null
    }
  },

  rekey(from: string, to: string) {
    const orphan = orphans.get(from)
    if (orphan) {
      orphans.delete(from)
      orphans.set(to, orphan)
    }
    for (const [k, state] of [...states]) {
      if (fileOf(k) !== from) continue
      states.delete(k)
      states.set(key(groupOf(k), to), state)
    }
    const stagedText = staged.get(from)
    if (stagedText !== undefined) {
      staged.delete(from)
      staged.set(to, stagedText)
    }
    for (const entry of views.values()) {
      if (entry.shownId === from) entry.shownId = to
    }
  },
}
