import { useEffect, useRef } from "react"

import {
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete"
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands"
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language"
import {
  highlightSelectionMatches,
  search,
  searchKeymap,
} from "@codemirror/search"
import { Compartment, EditorState } from "@codemirror/state"
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view"

import { cn } from "@/lib/utils"
import { editorRegistry, remoteSync } from "@/lib/editor-registry"
import { useThemeStore } from "@/lib/theme-store"
import { getTheme } from "@/lib/themes"
import { daad } from "@/language/language"
import {
  markDirty,
  setActiveGroup,
  setCursor,
  useIdeStore,
  type FileTab,
} from "@/store/ide"

const themeCompartment = new Compartment()

/** Right-to-left layout with per-line bidi, matching the original editor. */
const rtlLayout = EditorView.theme({
  "&": { height: "100%", direction: "rtl" },
  ".cm-scroller": { direction: "rtl" },
  ".cm-content": { direction: "rtl", unicodeBidi: "plaintext" },
  ".cm-line": { direction: "rtl", unicodeBidi: "plaintext" },
  ".cm-gutters": { borderRight: "none", direction: "ltr", minWidth: "40px" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 8px 0 4px", minWidth: "32px" },
})

interface CodeEditorProps {
  /** The editor group this view belongs to. */
  groupId: string
  /** The group's active file tab, or undefined when another view is showing. */
  tab: FileTab | undefined
}

/**
 * Extensions shared by every editor. They hold no component state: the
 * listener asks the registry which group and file the view shows, so a state
 * stays valid when its editor is remounted or moved to another group.
 */
const baseExtensions = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightActiveLine(),
  drawSelection(),
  history(),
  indentOnInput(),
  bracketMatching(),
  closeBrackets(),
  highlightSelectionMatches(),
  search({ top: true }),
  EditorView.lineWrapping,
  rtlLayout,
  daad(),
  // Themes bring their own highlight style; this is only a fallback.
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...completionKeymap,
    indentWithTab,
  ]),
  EditorView.updateListener.of((update) => {
    const info = editorRegistry.infoFor(update.view)
    if (!info?.fileId) return
    const replayed = update.transactions.some((tr) => tr.annotation(remoteSync))
    if (update.docChanged && !replayed) {
      markDirty(info.fileId)
      // Keep other groups showing the same file in step.
      editorRegistry.broadcast(info.groupId, info.fileId, update.changes)
    }
    // The status bar follows the group the user is working in.
    if (useIdeStore.getState().activeGroupId !== info.groupId) return
    if (update.docChanged || update.selectionSet) {
      const head = update.state.selection.main.head
      const line = update.state.doc.lineAt(head)
      setCursor(line.number, head - line.from + 1)
    }
  }),
]

/**
 * CodeMirror host for one editor group. The group's EditorView is reused for
 * all of its files: switching tabs swaps in that file's saved EditorState
 * (see `editorRegistry`).
 */
export function CodeEditor({ groupId, tab }: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  const themeKey = useThemeStore((state) => state.key)
  const themeRef = useRef(getTheme(themeKey).cm)
  themeRef.current = getTheme(themeKey).cm

  const createState = (doc: string) =>
    EditorState.create({
      doc,
      extensions: [...baseExtensions, themeCompartment.of(themeRef.current)],
    })

  // Create the view once.
  useEffect(() => {
    const view = new EditorView({ parent: hostRef.current! })
    viewRef.current = view
    editorRegistry.attach(groupId, view)
    return () => {
      editorRegistry.detach(groupId)
      view.destroy()
      viewRef.current = null
    }
    // A group's id never changes while it is mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Swap in the document of the active tab.
  const tabId = tab?.id
  const tabSaved = tab?.saved
  useEffect(() => {
    const view = viewRef.current
    if (!view || !tabId) return
    editorRegistry.show(groupId, tabId, tabSaved ?? "", createState)
    // Restored states carry the theme they were stashed with.
    view.dispatch({ effects: themeCompartment.reconfigure(themeRef.current) })
    view.requestMeasure()
    if (useIdeStore.getState().activeGroupId === groupId) {
      view.focus()
      const head = view.state.selection.main.head
      const line = view.state.doc.lineAt(head)
      setCursor(line.number, head - line.from + 1)
    }
    // `tabSaved` is only the initial text; later saves must not reset the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId])

  // Re-theme the live editor when the IDE theme changes.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartment.reconfigure(themeRef.current),
    })
  }, [themeKey])

  return (
    <div
      ref={hostRef}
      className={cn("h-full min-h-0 overflow-hidden", !tab && "hidden")}
      // Clicking or tabbing into an editor makes its group the active one.
      onFocusCapture={() => setActiveGroup(groupId)}
    />
  )
}
