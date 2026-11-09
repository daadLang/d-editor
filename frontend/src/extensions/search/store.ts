import { create } from "zustand"

import type {
  ExtensionContext,
  SearchFileResult,
  SearchMatch,
  SearchQuery,
  SearchSummary,
} from "@/core/api"

interface SearchState {
  query: string
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
  ignoreDiacritics: boolean
  include: string
  exclude: string
  showFilters: boolean
  showReplace: boolean
  replacement: string

  status: "idle" | "running" | "done" | "error"
  files: SearchFileResult[]
  summary: SearchSummary | null
  error: string | null
  /** Files whose matches are folded away in the list. */
  collapsed: Record<string, true>
}

export const useSearchStore = create<SearchState>()(() => ({
  query: "",
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  ignoreDiacritics: false,
  include: "",
  exclude: "",
  showFilters: false,
  showReplace: false,
  replacement: "",
  status: "idle",
  files: [],
  summary: null,
  error: null,
  collapsed: {},
}))

/**
 * Matches the user dismissed ("ignore this result"), as `path:line:n` where n
 * is the match's position among the matches on that line. A column would not
 * do: replacing an earlier match on the line moves the later ones.
 */
let dismissed = new Set<string>()

const keyOf = (path: string, line: number, nth: number) => `${path}:${line}:${nth}`

/** Each match with its position among the matches on its line. */
function numbered(matches: SearchMatch[]) {
  const seen = new Map<number, number>()
  return matches.map((match) => {
    const nth = seen.get(match.line) ?? 0
    seen.set(match.line, nth + 1)
    return { match, nth }
  })
}

/** The original position of each match on its line, kept when others are dismissed. */
const nthOf = new WeakMap<SearchMatch, number>()

function withoutDismissed(file: SearchFileResult): SearchFileResult | null {
  const all = numbered(file.matches)
  all.forEach(({ match, nth }) => nthOf.set(match, nth))
  const matches = all
    .filter(({ match, nth }) => !dismissed.has(keyOf(file.path, match.line, nth)))
    .map(({ match }) => match)
  return matches.length > 0 ? { ...file, matches } : null
}

let ctx: ExtensionContext | null = null
let controller: AbortController | null = null
/** What the results on screen were searched with; replacing must use the same. */
let lastQuery: SearchQuery | null = null

export function bindContext(next: ExtensionContext | null) {
  ctx = next
  if (!next) stopSearch()
}

export function stopSearch() {
  controller?.abort()
  controller = null
}

export function clearResults() {
  stopSearch()
  lastQuery = null
  dismissed = new Set()
  useSearchStore.setState({
    status: "idle",
    files: [],
    summary: null,
    error: null,
    collapsed: {},
  })
}

/** Starts a search with the current options, replacing any running one. */
export async function runSearch(keepCollapsed = false) {
  const state = useSearchStore.getState()
  if (!ctx || state.query === "") return clearResults()

  stopSearch()
  // A search the user started afresh forgets what was dismissed; the refresh
  // after a replace (keepCollapsed) keeps it.
  if (!keepCollapsed) dismissed = new Set()
  const mine = (controller = new AbortController())
  useSearchStore.setState({
    status: "running",
    files: [],
    summary: null,
    error: null,
    ...(keepCollapsed ? {} : { collapsed: {} }),
  })

  // Batches arrive often on big folders; fold them into one update per frame.
  let pending: SearchFileResult[] = []
  let scheduled = 0
  const flush = () => {
    scheduled = 0
    if (mine.signal.aborted || pending.length === 0) return
    const batch = pending.map(withoutDismissed).filter((f): f is SearchFileResult => f !== null)
    pending = []
    if (batch.length > 0) useSearchStore.setState((s) => ({ files: [...s.files, ...batch] }))
  }

  const query: SearchQuery = {
    query: state.query,
    caseSensitive: state.caseSensitive,
    wholeWord: state.wholeWord,
    regex: state.regex,
    ignoreDiacritics: state.ignoreDiacritics,
    include: state.include,
    exclude: state.exclude,
  }
  try {
    const summary = await ctx.findText(
      query,
      (files) => {
        pending.push(...files)
        if (!scheduled) scheduled = requestAnimationFrame(flush)
      },
      mine.signal
    )
    if (mine.signal.aborted) return
    cancelAnimationFrame(scheduled)
    flush()
    lastQuery = query
    useSearchStore.setState({ status: "done", summary })
  } catch (error) {
    if (mine.signal.aborted) return
    cancelAnimationFrame(scheduled)
    useSearchStore.setState({
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export function openMatch(path: string, line: number, column: number, length: number) {
  void ctx?.editor.openFile(path, { line, column, length })
}

export function toggleCollapsed(path: string) {
  useSearchStore.setState((s) => {
    const collapsed = { ...s.collapsed }
    if (collapsed[path]) delete collapsed[path]
    else collapsed[path] = true
    return { collapsed }
  })
}

// --- replace ---------------------------------------------------------------

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Replaces the given matches, then refreshes the results. */
async function replace(targets: { path: string; matches: SearchMatch[] }[]) {
  const state = useSearchStore.getState()
  if (!ctx || !lastQuery || state.status !== "done") return

  // Replaced matches disappear, so the dismissed ones after them on the same
  // line move up by one place.
  const replacedAt = new Map<string, number[]>()
  for (const { path, matches } of targets) {
    for (const match of matches) {
      const lineKey = `${path}:${match.line}`
      replacedAt.set(lineKey, [...(replacedAt.get(lineKey) ?? []), nthOf.get(match) ?? 0])
    }
  }
  const shifted = new Set<string>()
  for (const key of dismissed) {
    const cut = key.lastIndexOf(":")
    const lineKey = key.slice(0, cut)
    const nth = Number(key.slice(cut + 1))
    const before = (replacedAt.get(lineKey) ?? []).filter((r) => r < nth).length
    shifted.add(`${lineKey}:${nth - before}`)
  }
  dismissed = shifted

  try {
    const result = await ctx.replaceText(
      lastQuery,
      state.replacement,
      targets.map(({ path, matches }) => ({
        path,
        matches: matches.map(({ line, column, length }) => ({ line, column, length })),
      }))
    )
    if (result.errors.length > 0) ctx.ui.toast.error(result.errors.slice(0, 3).join("\n"))
    else if (result.replaced > 0) {
      ctx.ui.toast.info(
        `تم استبدال ${plural(result.replaced, "نتيجة", "نتيجة")} في ${plural(result.files, "ملف", "ملفات")}`
      )
    }
    if (result.skipped > 0) {
      ctx.ui.toast.info(`تُركت ${result.skipped} نتيجة لأن الملف تغيّر، أعد البحث`)
    }
  } catch (error) {
    ctx.ui.toast.error(error instanceof Error ? error.message : String(error))
  }
  await runSearch(true)
}

export function replaceMatch(path: string, match: SearchMatch) {
  return replace([{ path, matches: [match] }])
}

export function replaceInFile(path: string) {
  const file = useSearchStore.getState().files.find((f) => f.path === path)
  return file ? replace([file]) : Promise.resolve()
}

export async function replaceEverywhere() {
  const { files, summary, replacement, status } = useSearchStore.getState()
  if (!ctx || status !== "done" || files.length === 0) return
  const count = files.reduce((n, f) => n + f.matches.length, 0)
  const ok = await ctx.ui.confirm({
    title: `استبدال ${count} نتيجة في ${files.length} ملف؟`,
    message: [
      replacement === "" ? "ستُحذف النصوص المطابقة." : `سيُستبدل النص المطابق بـ «${replacement}».`,
      "الملفات المفتوحة تُعدَّل في المحرر ويمكن التراجع عنها، وغيرها يُكتب مباشرة على القرص.",
      summary?.truncated ? "النتائج مقتطعة؛ لن يُستبدل إلا ما هو معروض." : "",
    ]
      .filter(Boolean)
      .join("\n"),
    confirmLabel: "استبدال الكل",
    danger: true,
  })
  if (ok) await replace(files)
}

// --- dismiss ---------------------------------------------------------------

/** Takes a match out of the results; replace all will not touch it. */
export function dismissMatch(path: string, match: SearchMatch) {
  const state = useSearchStore.getState()
  const file = state.files.find((f) => f.path === path)
  if (!file) return
  dismissed.add(keyOf(path, match.line, nthOf.get(match) ?? 0))
  const matches = file.matches.filter((m) => m !== match)
  useSearchStore.setState({
    files:
      matches.length > 0
        ? state.files.map((f) => (f === file ? { ...f, matches } : f))
        : state.files.filter((f) => f !== file),
  })
}

/** Takes a whole file out of the results. */
export function dismissFile(path: string) {
  const state = useSearchStore.getState()
  const file = state.files.find((f) => f.path === path)
  if (!file) return
  for (const match of file.matches) dismissed.add(keyOf(path, match.line, nthOf.get(match) ?? 0))
  useSearchStore.setState({ files: state.files.filter((f) => f !== file) })
}
