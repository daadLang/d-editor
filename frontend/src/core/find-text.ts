import { basename } from "@/lib/path"
import { editorRegistry } from "@/lib/editor-registry"
import {
  api,
  errorMessage,
  type FileEdits,
  type ReplaceTarget,
  type SearchFileResult,
  type SearchOptions,
  type SearchSummary,
} from "@/lib/wails"
import { markDirty, useIdeStore } from "@/store/ide"

/** What an extension chooses; the folder and unsaved text are added here. */
export type SearchQuery = Omit<SearchOptions, "id" | "root" | "unsaved">

function newSearchId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

/**
 * Text of open files by path. Searching needs only the ones with edits not on
 * disk yet; replacing needs all of them, because an open file is changed
 * through its editor, never behind its back on disk.
 */
function openText(onlyDirty: boolean): Record<string, string> {
  const texts: Record<string, string> = {}
  for (const tab of useIdeStore.getState().tabs) {
    if (tab.type !== "file" || (onlyDirty && !tab.dirty)) continue
    const text = editorRegistry.getText(tab.id) ?? tab.saved
    if (text !== undefined) texts[tab.path] = text
  }
  return texts
}

/**
 * Searches the open folder. Batches of results are passed to `onBatch` as they
 * arrive; the promise resolves with the summary when the search ends, and
 * rejects when the query is invalid. Aborting `signal` cancels it (the promise
 * then resolves with `cancelled: true`).
 */
export function findText(
  query: SearchQuery,
  onBatch: (files: SearchFileResult[]) => void,
  signal?: AbortSignal
): Promise<SearchSummary> {
  const folder = useIdeStore.getState().folder
  const cancelledSummary: SearchSummary = {
    files: 0,
    matches: 0,
    truncated: false,
    cancelled: true,
    durationMs: 0,
  }
  if (!folder) return Promise.reject(new Error("لا يوجد مجلد مفتوح"))
  if (signal?.aborted) return Promise.resolve(cancelledSummary)

  const id = newSearchId()
  return new Promise((resolve, reject) => {
    let stopListening = () => {}
    let fallback: ReturnType<typeof setTimeout> | undefined

    const finish = (settle: () => void) => {
      stopListening()
      clearTimeout(fallback)
      signal?.removeEventListener("abort", onAbort)
      settle()
    }
    const onAbort = () => {
      void api.cancelSearch(id).catch(() => {})
      // Go answers a cancel with a final event; this only covers it never coming.
      fallback = setTimeout(() => finish(() => resolve(cancelledSummary)), 3000)
    }

    // Listen first: events can start before startSearch has returned.
    stopListening = api.onSearchEvent((event) => {
      if (event.id !== id) return
      if (event.files?.length) onBatch(event.files)
      if (!event.done) return
      finish(() =>
        event.error
          ? reject(new Error(event.error))
          : resolve(event.summary ?? cancelledSummary)
      )
    })
    signal?.addEventListener("abort", onAbort, { once: true })

    api
      .startSearch({ ...query, id, root: folder, unsaved: openText(true) })
      .catch((error) => finish(() => reject(new Error(errorMessage(error)))))
  })
}

export interface ReplaceResult {
  /** Files that were changed (on disk, or in an open editor). */
  files: number
  replaced: number
  /** Matches that had changed since the search and were left alone. */
  skipped: number
  errors: string[]
}

/**
 * Replaces the given matches (as `findText` reported them) with `replacement`.
 * In regex mode `$1` and `${name}` expand from the match's groups. Files open
 * in the editor are changed there (undoable, left unsaved, like any edit);
 * the others are written to disk.
 */
export async function replaceText(
  query: SearchQuery,
  replacement: string,
  targets: ReplaceTarget[]
): Promise<ReplaceResult> {
  const folder = useIdeStore.getState().folder
  if (!folder) throw new Error("لا يوجد مجلد مفتوح")
  const result: ReplaceResult = { files: 0, replaced: 0, skipped: 0, errors: [] }
  if (targets.length === 0) return result

  const unsaved = openText(false)
  let outcome: FileEdits[]
  try {
    outcome = await api.replaceInFiles(
      { ...query, id: "", root: folder, unsaved },
      replacement,
      targets
    )
  } catch (error) {
    throw new Error(errorMessage(error))
  }

  for (const file of outcome) {
    result.skipped += file.skipped
    if (file.error) {
      result.errors.push(`${basename(file.path)}: ${file.error}`)
      continue
    }
    if (file.edits.length === 0) continue
    if (!file.written) {
      const applied = editorRegistry.applyEdits(file.path, file.edits, unsaved[file.path])
      if (!applied) {
        result.errors.push(`${basename(file.path)}: الملف لم يعد مفتوحًا`)
        continue
      }
      markDirty(file.path)
    }
    result.files++
    result.replaced += file.edits.length
  }
  return result
}
