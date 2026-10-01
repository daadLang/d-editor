import { useEffect, useMemo, useRef } from "react"

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
import { editorRegistry } from "@/lib/editor-registry"
import { useThemeStore } from "@/lib/theme-store"
import { getTheme } from "@/lib/themes"
import { daad } from "@/language/language"
import { markDirty, setCursor, type FileTab } from "@/store/ide"

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
  /** The active file tab, or undefined when another view is showing. */
  tab: FileTab | undefined
}

/**
 * CodeMirror host. A single EditorView is reused for all files: switching tabs
 * swaps in that file's saved EditorState (see `editorRegistry`).
 */
export function CodeEditor({ tab }: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const shownIdRef = useRef<string | null>(null)

  const themeKey = useThemeStore((state) => state.key)
  const themeRef = useRef(getTheme(themeKey).cm)
  themeRef.current = getTheme(themeKey).cm

  const extensions = useMemo(
    () => [
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
        const id = shownIdRef.current
        if (!id) return
        if (update.docChanged) markDirty(id)
        if (update.docChanged || update.selectionSet) {
          const head = update.state.selection.main.head
          const line = update.state.doc.lineAt(head)
          setCursor(line.number, head - line.from + 1)
        }
      }),
    ],
    []
  )

  const createState = (doc: string) =>
    EditorState.create({
      doc,
      extensions: [...extensions, themeCompartment.of(themeRef.current)],
    })

  // Create the view once.
  useEffect(() => {
    const view = new EditorView({ parent: hostRef.current! })
    viewRef.current = view
    editorRegistry.attach(view)
    return () => {
      view.destroy()
      viewRef.current = null
      shownIdRef.current = null
      editorRegistry.detach()
    }
  }, [])

  // Swap in the document of the active tab.
  const tabId = tab?.id
  const tabSaved = tab?.saved
  useEffect(() => {
    const view = viewRef.current
    if (!view || !tabId) return
    editorRegistry.show(tabId, () => createState(tabSaved ?? ""))
    shownIdRef.current = tabId
    // Restored states carry the theme they were stashed with.
    view.dispatch({ effects: themeCompartment.reconfigure(themeRef.current) })
    view.requestMeasure()
    view.focus()
    const head = view.state.selection.main.head
    const line = view.state.doc.lineAt(head)
    setCursor(line.number, head - line.from + 1)
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
    />
  )
}
