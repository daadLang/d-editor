import { HighlightStyle, syntaxHighlighting } from "@codemirror/language"
import type { Extension } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { tags as t } from "@lezer/highlight"

/**
 * CodeMirror themes for the IDE's own "Daad" look. The accent is the green of
 * the logo (#47b243); the light variant uses a darker shade of that hue where
 * the colour is used as text, so it stays readable on white.
 */
interface EditorColors {
  dark: boolean
  bg: string
  fg: string
  caret: string
  selection: string
  activeLine: string
  gutter: string
  gutterActive: string
  panel: string
  border: string
  match: string
  keyword: string
  atom: string
  string: string
  number: string
  comment: string
  variable: string
  operator: string
  punctuation: string
  fn: string
  type: string
}

function buildTheme(c: EditorColors): Extension {
  const theme = EditorView.theme(
    {
      "&": { color: c.fg, backgroundColor: c.bg },
      ".cm-content": { caretColor: c.caret },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: c.caret,
        borderLeftWidth: "2px",
      },
      "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
        { backgroundColor: c.selection },
      ".cm-activeLine": { backgroundColor: c.activeLine },
      ".cm-gutters": { backgroundColor: c.bg, color: c.gutter, border: "none" },
      ".cm-activeLineGutter": { backgroundColor: c.activeLine, color: c.gutterActive },
      ".cm-selectionMatch": { backgroundColor: c.match },
      "&.cm-focused .cm-matchingBracket": {
        backgroundColor: c.match,
        outline: `1px solid ${c.caret}`,
      },
      "&.cm-focused .cm-nonmatchingBracket": {
        backgroundColor: c.dark ? "#5a1f24" : "#fcd9dc",
      },
      ".cm-panels": { backgroundColor: c.panel, color: c.fg },
      ".cm-panels.cm-panels-top": { borderBottom: `1px solid ${c.border}` },
      ".cm-searchMatch": { backgroundColor: c.match, outline: `1px solid ${c.caret}` },
      ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: c.selection },
      ".cm-tooltip": {
        backgroundColor: c.panel,
        color: c.fg,
        border: `1px solid ${c.border}`,
      },
      ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
        backgroundColor: c.selection,
        color: c.fg,
      },
    },
    { dark: c.dark }
  )

  const highlight = HighlightStyle.define([
    { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword], color: c.keyword, fontWeight: "600" },
    { tag: [t.atom, t.bool, t.null], color: c.atom },
    { tag: [t.string, t.special(t.string), t.regexp], color: c.string },
    { tag: t.number, color: c.number },
    { tag: [t.comment, t.lineComment, t.blockComment], color: c.comment, fontStyle: "italic" },
    { tag: [t.variableName, t.name], color: c.variable },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.standard(t.variableName)], color: c.fn },
    { tag: [t.definition(t.variableName), t.definition(t.propertyName)], color: c.fn },
    { tag: [t.typeName, t.className], color: c.type },
    { tag: t.propertyName, color: c.variable },
    { tag: [t.operator, t.operatorKeyword], color: c.operator },
    { tag: [t.punctuation, t.separator, t.bracket], color: c.punctuation },
    { tag: t.invalid, color: c.dark ? "#ff7b72" : "#cf222e" },
  ])

  return [theme, syntaxHighlighting(highlight)]
}

export const daadDarkEditor = buildTheme({
  dark: true,
  bg: "#0e1511",
  fg: "#dbe8df",
  caret: "#47b243",
  selection: "#2a4a30",
  activeLine: "#141f19",
  gutter: "#5d7266",
  gutterActive: "#a5b9ac",
  panel: "#121b16",
  border: "#24342b",
  match: "#2c5a33",
  keyword: "#47b243",
  atom: "#c79bf2",
  string: "#e8b86a",
  number: "#7cc7f0",
  comment: "#6f8577",
  variable: "#dbe8df",
  operator: "#8fd18b",
  punctuation: "#9db3a4",
  fn: "#34b6e2",
  type: "#7fdca8",
})

export const daadLightEditor = buildTheme({
  dark: false,
  bg: "#fbfdfb",
  fg: "#14211a",
  caret: "#277f25",
  selection: "#c4e5c5",
  activeLine: "#eef6ef",
  gutter: "#8da095",
  gutterActive: "#3f5247",
  panel: "#f0f6f1",
  border: "#cfe0d3",
  match: "#cfeacf",
  keyword: "#1f7a1d",
  atom: "#7a3fb0",
  string: "#9a5b00",
  number: "#0b6fa3",
  comment: "#62756a",
  variable: "#14211a",
  operator: "#2b7a28",
  punctuation: "#55695c",
  fn: "#0a6f94",
  type: "#1b7a55",
})
