import { toast } from "sonner"
import { create } from "zustand"

import { editorRegistry } from "@/lib/editor-registry"
import { basename, isInside, joinPath } from "@/lib/path"
import { addRecentProject, getRecentProjects } from "@/lib/recent"
import { applyTheme } from "@/lib/theme-store"
import { getTheme } from "@/lib/themes"
import { api, errorMessage, type FileEntry, type Settings } from "@/lib/wails"

// ── types ───────────────────────────────────────────────────────────────────

export interface FileTab {
  id: string
  type: "file"
  title: string
  path: string
  /** Text as last loaded from / written to disk. */
  saved: string
  dirty: boolean
}

export interface SettingsTab {
  id: "settings"
  type: "settings"
  title: string
}

export type Tab = FileTab | SettingsTab

export type OutputKind = "stdout" | "stderr" | "stdin" | "info"

export interface OutputSegment {
  id: number
  kind: OutputKind
  text: string
}

export type DialogState =
  | { kind: "new-project" }
  | { kind: "new-file"; dir: string }
  | { kind: "rename"; entry: FileEntry }
  | { kind: "delete"; entry: FileEntry }
  | null

export type SaveAnswer = "save" | "discard" | "cancel"

interface IdeState {
  folder: string | null
  recents: string[]
  /** Bumped whenever the file system changes so open folders reload. */
  treeVersion: number

  tabs: Tab[]
  activeId: string | null
  cursor: { line: number; col: number }

  settings: Settings

  output: {
    open: boolean
    running: boolean
    exitCode: number | null
    segments: OutputSegment[]
  }

  dialog: DialogState
  confirmSave: { names: string[] } | null
  paletteOpen: boolean
}

export const useIdeStore = create<IdeState>()(() => ({
  folder: null,
  recents: getRecentProjects(),
  treeVersion: 0,

  tabs: [],
  activeId: null,
  cursor: { line: 1, col: 1 },

  settings: {
    projectPath: "",
    theme: "vsCodeDark",
    themeCategory: "dark",
    interpreterPath: "",
  },

  output: { open: false, running: false, exitCode: null, segments: [] },

  dialog: null,
  confirmSave: null,
  paletteOpen: false,
}))

const get = useIdeStore.getState
const set = useIdeStore.setState

// ── selectors ───────────────────────────────────────────────────────────────

export const selectActiveTab = (state: IdeState) =>
  state.tabs.find((tab) => tab.id === state.activeId)

// ── settings ────────────────────────────────────────────────────────────────

export async function loadSettings() {
  try {
    const loaded = await api.readSettings()
    const theme = getTheme(loaded?.theme)
    set({
      settings: {
        projectPath: loaded?.projectPath ?? "",
        theme: theme.key,
        themeCategory: theme.category,
        interpreterPath: loaded?.interpreterPath ?? "",
      },
    })
    applyTheme(theme.key)
  } catch (error) {
    console.error("Failed to load settings:", error)
  }
}

/** Merges a change into the settings and persists it immediately. */
export async function updateSettings(patch: Partial<Settings>) {
  const next = { ...get().settings, ...patch }
  if (patch.theme) {
    const theme = getTheme(patch.theme)
    next.theme = theme.key
    next.themeCategory = theme.category
    applyTheme(theme.key)
  }
  set({ settings: next })
  try {
    await api.writeSettings(next)
  } catch (error) {
    toast.error(`تعذر حفظ الإعدادات: ${errorMessage(error)}`)
  }
}

// ── dialogs ─────────────────────────────────────────────────────────────────

export const openDialog = (dialog: Exclude<DialogState, null>) => set({ dialog })
export const closeDialog = () => set({ dialog: null })
export const setPaletteOpen = (paletteOpen: boolean) => set({ paletteOpen })

let saveResolver: ((answer: SaveAnswer) => void) | null = null

/** Asks whether unsaved changes should be saved; resolves with the choice. */
function askToSave(names: string[]) {
  return new Promise<SaveAnswer>((resolve) => {
    saveResolver = resolve
    set({ confirmSave: { names } })
  })
}

export function answerSave(answer: SaveAnswer) {
  saveResolver?.(answer)
  saveResolver = null
  set({ confirmSave: null })
}

// ── project folder ──────────────────────────────────────────────────────────

export function setFolder(path: string) {
  set({
    folder: path,
    recents: addRecentProject(path),
    treeVersion: get().treeVersion + 1,
  })
}

export async function openFolder() {
  try {
    const path = await api.openFolderDialog()
    if (path) setFolder(path)
  } catch (error) {
    toast.error(`فشل فتح المجلد: ${errorMessage(error)}`)
  }
}

export async function createProject(name: string) {
  try {
    const path = await api.createProjectFolder(name, get().settings.projectPath)
    if (!path) return
    setFolder(path)
    await openFile(joinPath(path, "رئيسي.ض"))
  } catch (error) {
    toast.error(`فشل إنشاء المشروع: ${errorMessage(error)}`)
  }
}

// ── tabs ────────────────────────────────────────────────────────────────────

export function activateTab(id: string) {
  if (get().tabs.some((tab) => tab.id === id)) set({ activeId: id })
}

export async function openFile(path: string) {
  const existing = get().tabs.find((tab) => tab.id === path)
  if (existing) return activateTab(existing.id)

  try {
    const saved = await api.readFile(path)
    const tab: FileTab = {
      id: path,
      type: "file",
      title: basename(path),
      path,
      saved,
      dirty: false,
    }
    set({ tabs: [...get().tabs, tab], activeId: tab.id })
  } catch (error) {
    toast.error(`فشل فتح الملف: ${errorMessage(error)}`)
  }
}

export function openSettings() {
  if (!get().tabs.some((tab) => tab.id === "settings")) {
    set({
      tabs: [...get().tabs, { id: "settings", type: "settings", title: "الإعدادات" }],
    })
  }
  set({ activeId: "settings" })
}

export function toggleSettings() {
  if (get().activeId === "settings") void closeTab("settings")
  else openSettings()
}

export function markDirty(id: string) {
  const tab = get().tabs.find((t) => t.id === id)
  if (!tab || tab.type !== "file" || tab.dirty) return
  set({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, dirty: true } : t)) })
}

export async function saveTab(id: string): Promise<boolean> {
  const tab = get().tabs.find((t) => t.id === id)
  if (!tab || tab.type !== "file") return true
  const text = editorRegistry.getText(id) ?? tab.saved
  try {
    await api.writeFile(tab.path, text)
    set({
      tabs: get().tabs.map((t) =>
        t.id === id && t.type === "file" ? { ...t, saved: text, dirty: false } : t
      ),
    })
    return true
  } catch (error) {
    toast.error(`فشل حفظ الملف: ${errorMessage(error)}`)
    return false
  }
}

export async function saveActive() {
  const tab = selectActiveTab(get())
  if (tab?.type !== "file") return
  if (await saveTab(tab.id)) toast.success("تم الحفظ", { duration: 1500 })
}

function removeTabs(ids: string[]) {
  const { tabs, activeId } = get()
  let nextActive = activeId

  if (activeId && ids.includes(activeId)) {
    const index = tabs.findIndex((tab) => tab.id === activeId)
    const after = tabs.slice(index + 1).find((tab) => !ids.includes(tab.id))
    const before = tabs.slice(0, index).reverse().find((tab) => !ids.includes(tab.id))
    nextActive = (after ?? before)?.id ?? null
  }

  ids.forEach((id) => editorRegistry.discard(id))
  set({ tabs: tabs.filter((tab) => !ids.includes(tab.id)), activeId: nextActive })
}

/** Closes tabs, asking once about any unsaved changes. */
export async function closeTabs(ids: string[]) {
  const targets = get().tabs.filter((tab) => ids.includes(tab.id))
  const dirty = targets.filter((tab): tab is FileTab => tab.type === "file" && tab.dirty)

  if (dirty.length > 0) {
    const answer = await askToSave(dirty.map((tab) => tab.title))
    if (answer === "cancel") return
    if (answer === "save") {
      for (const tab of dirty) if (!(await saveTab(tab.id))) return
    }
  }
  removeTabs(targets.map((tab) => tab.id))
}

export const closeTab = (id: string) => closeTabs([id])
export const closeOtherTabs = (id: string) =>
  closeTabs(get().tabs.filter((tab) => tab.id !== id).map((tab) => tab.id))
export const closeAllTabs = () => closeTabs(get().tabs.map((tab) => tab.id))

// ── file system operations (explorer context menu) ──────────────────────────

const refreshTree = () => set({ treeVersion: get().treeVersion + 1 })

export async function createFileIn(dir: string, name: string) {
  const path = joinPath(dir, name)
  try {
    await api.createFile(path)
    refreshTree()
    await openFile(path)
  } catch (error) {
    toast.error(`تعذر إنشاء الملف: ${errorMessage(error)}`)
  }
}

export async function renameEntry(entry: FileEntry, newName: string) {
  const newPath = joinPath(entry.path.slice(0, entry.path.length - entry.name.length), newName)
  try {
    await api.renamePath(entry.path, newPath)
  } catch (error) {
    toast.error(`تعذر إعادة التسمية: ${errorMessage(error)}`)
    return
  }

  // Keep open tabs pointing at the renamed files.
  const { tabs, activeId } = get()
  const remap = (id: string) =>
    isInside(id, entry.path) ? newPath + id.slice(entry.path.length) : id
  set({
    tabs: tabs.map((tab) => {
      if (tab.type !== "file" || !isInside(tab.path, entry.path)) return tab
      const path = remap(tab.path)
      editorRegistry.rekey(tab.id, path)
      return { ...tab, id: path, path, title: basename(path) }
    }),
    activeId: activeId ? remap(activeId) : null,
  })
  if (get().folder === entry.path) setFolder(newPath)
  refreshTree()
}

export async function deleteEntry(entry: FileEntry) {
  try {
    await api.deletePath(entry.path)
  } catch (error) {
    toast.error(`تعذر الحذف: ${errorMessage(error)}`)
    return
  }
  const affected = get()
    .tabs.filter((tab) => tab.type === "file" && isInside(tab.path, entry.path))
    .map((tab) => tab.id)
  removeTabs(affected)
  refreshTree()
}

// ── running code ────────────────────────────────────────────────────────────

let segmentId = 0

export function appendOutput(kind: OutputKind, text: string) {
  const { segments } = get().output
  const last = segments.at(-1)
  const streaming = kind === "stdout" || kind === "stderr"

  let next: OutputSegment[]
  if (streaming && last?.kind === kind) {
    next = [...segments.slice(0, -1), { ...last, text: last.text + text }]
  } else {
    // Messages from the IDE itself always start on a fresh line.
    const needsBreak = last && !last.text.endsWith("\n")
    next = [
      ...segments,
      { id: ++segmentId, kind, text: (needsBreak ? "\n" : "") + text },
    ]
  }
  set({ output: { ...get().output, segments: next } })
}

export const setOutputOpen = (open: boolean) =>
  set({ output: { ...get().output, open } })

export const toggleOutput = () => setOutputOpen(!get().output.open)

export const clearOutput = () =>
  set({ output: { ...get().output, segments: [], exitCode: null } })

export async function runActive() {
  const tab = selectActiveTab(get())
  if (tab?.type !== "file") {
    toast.error("لا يوجد ملف مفتوح للتشغيل")
    return
  }
  if (get().output.running) return
  if (tab.dirty && !(await saveTab(tab.id))) return

  set({ output: { open: true, running: true, exitCode: null, segments: [] } })
  appendOutput("info", ` تشغيل ${tab.title}…\n`)

  try {
    const result = await api.runDaad(tab.path, get().settings.interpreterPath)
    appendOutput("info", `انتهى التشغيل برمز الخروج: ${result.code}\n`)
    set({ output: { ...get().output, running: false, exitCode: result.code } })
  } catch (error) {
    appendOutput("stderr", `خطأ في التشغيل: ${errorMessage(error)}\n`)
    set({ output: { ...get().output, running: false, exitCode: -1 } })
  }
}

export async function sendStdin(text: string) {
  appendOutput("stdin", text + "\n")
  try {
    await api.writeToDaadStdin(text + "\n")
  } catch (error) {
    console.warn("writeToDaadStdin failed:", error)
  }
}

export async function endStdin() {
  try {
    if (await api.endDaadStdin()) appendOutput("stdin", "<EOF>\n")
  } catch (error) {
    console.warn("endDaadStdin failed:", error)
  }
}

// ── editor status ───────────────────────────────────────────────────────────

export function setCursor(line: number, col: number) {
  const current = get().cursor
  if (current.line !== line || current.col !== col) set({ cursor: { line, col } })
}
