import { toast } from "sonner"
import { create } from "zustand"

import { editorRegistry } from "@/lib/editor-registry"
import { basename, isInside, joinPath } from "@/lib/path"
import { addRecentProject, getRecentProjects } from "@/lib/recent"
import { applyTheme, useThemeStore } from "@/lib/theme-store"
import { toggleEditorOrientation, useLayoutStore } from "@/store/layout"
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

/** One editor area. Several groups can sit side by side (like VS Code). */
export interface EditorGroup {
  id: string
  /** Open tabs in display order. A tab id may appear in several groups. */
  tabIds: string[]
  activeId: string | null
}

/**
 * How editor groups are arranged: a tree of splits whose leaves are groups.
 * Children are in logical order; in this RTL IDE the first child of a
 * horizontal split is drawn on the right.
 */
export type LayoutNode =
  | { type: "group"; id: string }
  | {
      type: "split"
      id: string
      orientation: "horizontal" | "vertical"
      children: LayoutNode[]
    }

/** The side of a group a dragged tab was dropped on (as seen on screen). */
export type DropEdge = "left" | "right" | "top" | "bottom"

export type SettingsSection = "interpreter"

export interface InterpreterState {
  /** `unknown` until the first check finishes. */
  status: "unknown" | "ready" | "missing"
  label: string
  version: string
  path: string
  source: string
  reason: string
}

export type OutputKind = "stdout" | "stderr" | "stdin" | "info"

export interface OutputSegment {
  id: number
  kind: OutputKind
  text: string
}

export type DialogState =
  | { kind: "new-project" }
  | { kind: "new-file"; dir: string }
  | { kind: "new-folder"; dir: string }
  | { kind: "rename"; entry: FileEntry }
  | { kind: "delete"; entry: FileEntry }
  | null

export type SaveAnswer = "save" | "discard" | "cancel"

interface IdeState {
  folder: string | null
  recents: string[]
  /** Bumped whenever the file system changes so open folders reload. */
  treeVersion: number
  /** Bumped by "collapse all" so every expanded explorer folder closes. */
  collapseVersion: number

  /** Every open document; each is shown by one or more groups. */
  tabs: Tab[]
  groups: EditorGroup[]
  layout: LayoutNode
  activeGroupId: string
  /** Active tab of the active group (kept in sync by `commit`). */
  activeId: string | null
  cursor: { line: number; col: number }

  settings: Settings
  interpreter: InterpreterState
  /** Asks the settings view to scroll to a section when it shows. */
  settingsFocus: { section: SettingsSection; nonce: number } | null

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
  collapseVersion: 0,

  tabs: [],
  groups: [{ id: "g1", tabIds: [], activeId: null }],
  layout: { type: "group", id: "g1" },
  activeGroupId: "g1",
  activeId: null,
  cursor: { line: 1, col: 1 },

  settings: {
    projectPath: "",
    // "" = no choice yet: Daad Light/Dark by the OS setting.
    theme: "",
    themeCategory: "dark",
    interpreterPath: "",
  },
  interpreter: {
    status: "unknown",
    label: "",
    version: "",
    path: "",
    source: "",
    reason: "",
  },
  settingsFocus: null,

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
    const choice = getTheme(loaded?.theme).key === loaded?.theme ? loaded.theme : ""
    applyTheme(choice)
    set({
      settings: {
        projectPath: loaded?.projectPath ?? "",
        theme: choice,
        themeCategory: useThemeStore.getState().category,
        interpreterPath: loaded?.interpreterPath ?? "",
      },
    })
  } catch (error) {
    console.error("Failed to load settings:", error)
  }
  // Warn right away (not on the first failed run) when nothing can run code.
  void refreshInterpreter({ notify: true })
}

/** Merges a change into the settings and persists it immediately. */
export async function updateSettings(patch: Partial<Settings>) {
  const next = { ...get().settings, ...patch }
  if (patch.theme !== undefined) {
    // "" goes back to the default theme.
    applyTheme(patch.theme)
    next.theme = useThemeStore.getState().isDefault ? "" : useThemeStore.getState().key
    next.themeCategory = useThemeStore.getState().category
  }
  set({ settings: next })
  try {
    await api.writeSettings(next)
  } catch (error) {
    toast.error(`تعذر حفظ الإعدادات: ${errorMessage(error)}`)
  }
  if (patch.interpreterPath !== undefined) void refreshInterpreter()
}

// ── interpreter ─────────────────────────────────────────────────────────────

const MISSING_INTERPRETER_TOAST = "interpreter-missing"

/** Checks which interpreter would run code and updates the status + CTA. */
export async function refreshInterpreter({ notify = false } = {}) {
  let status: Awaited<ReturnType<typeof api.getInterpreterStatus>>
  try {
    status = await api.getInterpreterStatus(get().settings.interpreterPath)
  } catch (error) {
    console.error("Failed to check interpreter:", error)
    return null
  }

  set({
    interpreter: {
      status: status.found ? "ready" : "missing",
      label: status.label,
      version: status.version,
      path: status.path,
      source: status.source,
      reason: status.reason,
    },
  })

  if (status.found) toast.dismiss(MISSING_INTERPRETER_TOAST)
  else if (notify) notifyMissingInterpreter(status.reason, status.path)
  return status
}

/** Persistent notification that leads the user to install or pick one. */
export function notifyMissingInterpreter(reason: string, path = "") {
  toast.warning(
    reason === "missing-file"
      ? "المفسر المحدد لم يعد موجودًا"
      : "لم يتم العثور على مفسر ضاد",
    {
      id: MISSING_INTERPRETER_TOAST,
      duration: Infinity,
      closeButton: true,
      description:
        reason === "missing-file"
          ? `تعذر العثور على ${path}. اختر مفسرًا آخر أو ثبّت أحدث إصدار.`
          : "تحتاج إلى مفسر لتشغيل البرامج. ثبّت أحدث إصدار بنقرة واحدة أو اختر مفسرًا موجودًا على جهازك.",
      action: {
        label: "تثبيت / اختيار مفسر",
        onClick: () => openSettings("interpreter"),
      },
    }
  )
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

// ── editor groups & tabs ────────────────────────────────────────────────────

let groupCounter = 1
const newGroupId = () => `g${++groupCounter}`
let splitCounter = 0
const newSplitId = () => `s${++splitCounter}`

// ── layout tree helpers ─────────────────────────────────────────────────────

/** Puts `newId` next to the group `targetId`, on the given screen edge. */
function insertBeside(
  node: LayoutNode,
  targetId: string,
  newId: string,
  edge: DropEdge
): LayoutNode {
  const orientation = edge === "left" || edge === "right" ? "horizontal" : "vertical"
  // Horizontal splits are drawn right-to-left, so the screen's right side is
  // *earlier* in the logical order.
  const before = edge === "right" || edge === "top"
  const leaf: LayoutNode = { type: "group", id: newId }

  if (node.type === "group") {
    if (node.id !== targetId) return node
    return {
      type: "split",
      id: newSplitId(),
      orientation,
      children: before ? [leaf, node] : [node, leaf],
    }
  }

  const index = node.children.findIndex((c) => c.type === "group" && c.id === targetId)
  if (index >= 0 && node.orientation === orientation) {
    const children = [...node.children]
    children.splice(before ? index : index + 1, 0, leaf)
    return { ...node, children }
  }
  return {
    ...node,
    children: node.children.map((child) => insertBeside(child, targetId, newId, edge)),
  }
}

/** Drops groups that no longer exist and collapses splits left with one child. */
function pruneLayout(node: LayoutNode, alive: Set<string>): LayoutNode | null {
  if (node.type === "group") return alive.has(node.id) ? node : null
  const children = node.children
    .map((child) => pruneLayout(child, alive))
    .filter((child): child is LayoutNode => child !== null)
    // A split nested in a split of the same direction is just more siblings.
    .flatMap((child) =>
      child.type === "split" && child.orientation === node.orientation
        ? child.children
        : [child]
    )
  if (children.length === 0) return null
  if (children.length === 1) return children[0]
  return { ...node, children }
}

function layoutLeaves(node: LayoutNode): string[] {
  return node.type === "group" ? [node.id] : node.children.flatMap(layoutLeaves)
}

function flipLayout(node: LayoutNode): LayoutNode {
  if (node.type === "group") return node
  return {
    ...node,
    orientation: node.orientation === "horizontal" ? "vertical" : "horizontal",
    children: node.children.map(flipLayout),
  }
}

interface LayoutPatch {
  tabs?: Tab[]
  groups?: EditorGroup[]
  layout?: LayoutNode
  activeGroupId?: string
}

/**
 * The single place that writes tabs/groups. It keeps them consistent:
 * empty groups disappear (the last one stays) together with their place in
 * the layout, every group's active tab is one of its own tabs, documents no
 * group shows any more are released, and `activeId` mirrors the active
 * group's active tab.
 */
function commit(patch: LayoutPatch) {
  const state = get()
  let tabs = patch.tabs ?? state.tabs
  let groups = patch.groups ?? state.groups
  let activeGroupId = patch.activeGroupId ?? state.activeGroupId

  const exists = new Set(tabs.map((tab) => tab.id))
  groups = groups.map((group) => ({
    ...group,
    tabIds: group.tabIds.filter((id) => exists.has(id)),
  }))
  if (groups.length > 1) groups = groups.filter((group) => group.tabIds.length > 0)
  groups = groups.map((group) =>
    group.activeId && group.tabIds.includes(group.activeId)
      ? group
      : { ...group, activeId: group.tabIds.at(-1) ?? null }
  )
  if (!groups.some((group) => group.id === activeGroupId)) {
    activeGroupId = groups[0].id
  }

  // Keep the layout tree in step with the surviving groups.
  const alive = new Set(groups.map((group) => group.id))
  let layout = pruneLayout(patch.layout ?? state.layout, alive)
  const leaves = layout ? layoutLeaves(layout) : []
  if (!layout || leaves.length !== alive.size || !leaves.every((id) => alive.has(id))) {
    // Should not happen; rebuild a simple row rather than lose a group.
    layout =
      groups.length === 1
        ? { type: "group", id: groups[0].id }
        : {
            type: "split",
            id: newSplitId(),
            orientation: "horizontal",
            children: groups.map((group) => ({ type: "group", id: group.id })),
          }
  }

  const shown = new Set(groups.flatMap((group) => group.tabIds))
  tabs.filter((tab) => !shown.has(tab.id)).forEach((tab) => editorRegistry.discard(tab.id))
  tabs = tabs.filter((tab) => shown.has(tab.id))

  state.groups
    .filter((old) => !alive.has(old.id))
    .forEach((old) => editorRegistry.forgetGroup(old.id))

  const activeId = groups.find((group) => group.id === activeGroupId)?.activeId ?? null
  set({ tabs, groups, layout, activeGroupId, activeId })
}

const mapGroup = (id: string, change: (group: EditorGroup) => EditorGroup) =>
  get().groups.map((group) => (group.id === id ? change(group) : group))

/** The tab to select after `removed` leave `group`: the next, else the previous. */
function neighbourAfterRemoval(group: EditorGroup, removed: string[]) {
  if (!group.activeId || !removed.includes(group.activeId)) return group.activeId
  const index = group.tabIds.indexOf(group.activeId)
  const keep = (id: string) => !removed.includes(id)
  return (
    group.tabIds.slice(index + 1).find(keep) ??
    group.tabIds.slice(0, index).reverse().find(keep) ??
    null
  )
}

export function setActiveGroup(groupId: string) {
  if (groupId !== get().activeGroupId && get().groups.some((g) => g.id === groupId)) {
    commit({ activeGroupId: groupId })
  }
}

export function activateTab(id: string, groupId = get().activeGroupId) {
  const group = get().groups.find((g) => g.id === groupId)
  if (!group?.tabIds.includes(id)) return
  commit({
    groups: mapGroup(groupId, (g) => ({ ...g, activeId: id })),
    activeGroupId: groupId,
  })
}

/** Shows an existing document in a group (appending its tab if needed). */
function reveal(id: string, groupId: string) {
  const target = get().groups.some((g) => g.id === groupId)
    ? groupId
    : get().activeGroupId
  commit({
    groups: mapGroup(target, (g) => ({
      ...g,
      tabIds: g.tabIds.includes(id) ? g.tabIds : [...g.tabIds, id],
      activeId: id,
    })),
    activeGroupId: target,
  })
}

/** Makes sure a file is loaded as a document (without showing it anywhere). */
async function ensureDocument(path: string): Promise<boolean> {
  if (get().tabs.some((tab) => tab.id === path)) return true
  try {
    const saved = await api.readFile(path)
    if (!get().tabs.some((tab) => tab.id === path)) {
      const tab: FileTab = {
        id: path,
        type: "file",
        title: basename(path),
        path,
        saved,
        dirty: false,
      }
      set({ tabs: [...get().tabs, tab] })
    }
    return true
  } catch (error) {
    toast.error(`فشل فتح الملف: ${errorMessage(error)}`)
    return false
  }
}

export async function openFile(path: string, groupId = get().activeGroupId) {
  if (await ensureDocument(path)) reveal(path, groupId)
}

export function openSettings(section?: SettingsSection) {
  if (!get().tabs.some((tab) => tab.id === "settings")) {
    set({
      tabs: [...get().tabs, { id: "settings", type: "settings", title: "الإعدادات" }],
    })
  }
  // Reveal where it is already open, otherwise open it in the active group.
  const holder = get().groups.find((g) => g.tabIds.includes("settings"))
  reveal("settings", holder?.id ?? get().activeGroupId)
  if (section) {
    set({ settingsFocus: { section, nonce: (get().settingsFocus?.nonce ?? 0) + 1 } })
  }
}

export const clearSettingsFocus = () => set({ settingsFocus: null })

export function toggleSettings() {
  if (get().activeId === "settings") void closeTab("settings")
  else openSettings()
}

/** The screen edge a plain "split" (button or shortcut) opens a new editor on. */
function defaultSplitEdge(): DropEdge {
  return useLayoutStore.getState().editorOrientation === "horizontal" ? "left" : "bottom"
}

/** Creates a group holding `tabIds`, placed beside `targetId`. */
function addGroupBeside(
  targetId: string,
  edge: DropEdge,
  tabIds: string[],
  activeId: string,
  base: EditorGroup[] = get().groups
) {
  const group: EditorGroup = { id: newGroupId(), tabIds, activeId }
  return {
    group,
    patch: {
      groups: [...base, group],
      layout: insertBeside(get().layout, targetId, group.id, edge),
      activeGroupId: group.id,
    } satisfies LayoutPatch,
  }
}

/** Opens a second editor next to the active one, showing the same tab. */
export function splitActiveGroup() {
  const { groups, activeGroupId } = get()
  const source = groups.find((g) => g.id === activeGroupId)
  if (!source?.activeId) return
  const { patch } = addGroupBeside(
    source.id,
    defaultSplitEdge(),
    [source.activeId],
    source.activeId
  )
  commit(patch)
}

/**
 * A tab dropped on the edge of a group moves into a new group on that side
 * (the VS Code gesture). Dropping a group's only tab on its own edge is a no-op.
 */
export function dropTabOnEdge(
  id: string,
  fromGroupId: string,
  targetGroupId: string,
  edge: DropEdge
) {
  const { groups } = get()
  const from = groups.find((g) => g.id === fromGroupId)
  if (!from?.tabIds.includes(id) || !groups.some((g) => g.id === targetGroupId)) return
  if (fromGroupId === targetGroupId && from.tabIds.length === 1) return

  const trimmed = groups.map((group) =>
    group.id === fromGroupId
      ? {
          ...group,
          activeId: neighbourAfterRemoval(group, [id]),
          tabIds: group.tabIds.filter((tabId) => tabId !== id),
        }
      : group
  )
  const { patch } = addGroupBeside(targetGroupId, edge, [id], id, trimmed)
  editorRegistry.release(fromGroupId, id)
  commit(patch)
}

/** A file dragged from the explorer onto a group's edge opens in a new group. */
export async function dropFileOnEdge(path: string, targetGroupId: string, edge: DropEdge) {
  if (!(await ensureDocument(path))) return
  const target = get().groups.find((g) => g.id === targetGroupId)
  if (!target) return
  const { patch } = addGroupBeside(targetGroupId, edge, [path], path)
  commit(patch)
}

/** Flips every split between side-by-side and stacked. */
export function flipEditorLayout() {
  toggleEditorOrientation()
  commit({ layout: flipLayout(get().layout) })
}

/** Moves a tab to another group, optionally before `beforeId`; also reorders. */
export function moveTab(
  id: string,
  fromGroupId: string,
  toGroupId: string,
  beforeId: string | null = null
) {
  const { groups } = get()
  const from = groups.find((g) => g.id === fromGroupId)
  if (!from?.tabIds.includes(id) || !groups.some((g) => g.id === toGroupId)) return
  if (id === beforeId && fromGroupId === toGroupId) return

  const next = groups.map((group) => {
    let tabIds = group.tabIds
    let activeId = group.activeId
    if (group.id === fromGroupId && fromGroupId !== toGroupId) {
      activeId = neighbourAfterRemoval(group, [id])
      tabIds = tabIds.filter((tabId) => tabId !== id)
    }
    if (group.id === toGroupId) {
      tabIds = tabIds.filter((tabId) => tabId !== id)
      const at = beforeId ? tabIds.indexOf(beforeId) : -1
      tabIds = at >= 0 ? [...tabIds.slice(0, at), id, ...tabIds.slice(at)] : [...tabIds, id]
      activeId = id
    }
    return { ...group, tabIds, activeId }
  })
  if (fromGroupId !== toGroupId) editorRegistry.release(fromGroupId, id)
  commit({ groups: next, activeGroupId: toGroupId })
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

interface TabRef {
  groupId: string
  id: string
}

/**
 * Closes tabs in specific groups. Unsaved changes only matter for documents
 * that would no longer be open anywhere, and are asked about once.
 */
async function closeEntries(entries: TabRef[]) {
  const { groups, tabs } = get()
  const closing = (groupId: string, id: string) =>
    entries.some((entry) => entry.groupId === groupId && entry.id === id)

  const stillOpen = new Set(
    groups.flatMap((g) => g.tabIds.filter((id) => !closing(g.id, id)))
  )
  const gone = new Set(entries.map((entry) => entry.id).filter((id) => !stillOpen.has(id)))
  const dirty = tabs.filter(
    (tab): tab is FileTab => tab.type === "file" && tab.dirty && gone.has(tab.id)
  )

  if (dirty.length > 0) {
    const answer = await askToSave(dirty.map((tab) => tab.title))
    if (answer === "cancel") return
    if (answer === "save") {
      for (const tab of dirty) if (!(await saveTab(tab.id))) return
    }
  }

  entries.forEach((entry) => editorRegistry.discardInGroup(entry.groupId, entry.id))
  commit({
    groups: get().groups.map((group) => {
      const removed = entries.filter((e) => e.groupId === group.id).map((e) => e.id)
      if (removed.length === 0) return group
      return {
        ...group,
        activeId: neighbourAfterRemoval(group, removed),
        tabIds: group.tabIds.filter((id) => !removed.includes(id)),
      }
    }),
  })
}

const refsIn = (groupId: string, ids: string[]) => ids.map((id) => ({ groupId, id }))

export const closeTabs = (ids: string[], groupId = get().activeGroupId) =>
  closeEntries(refsIn(groupId, ids))

export const closeTab = (id: string, groupId = get().activeGroupId) =>
  closeEntries(refsIn(groupId, [id]))

export function closeOtherTabs(id: string, groupId = get().activeGroupId) {
  const group = get().groups.find((g) => g.id === groupId)
  return closeEntries(refsIn(groupId, (group?.tabIds ?? []).filter((t) => t !== id)))
}

/** Closes every tab in one group. */
export function closeGroupTabs(groupId: string) {
  const group = get().groups.find((g) => g.id === groupId)
  return closeEntries(refsIn(groupId, group?.tabIds ?? []))
}

export const closeAllTabs = () =>
  closeEntries(get().groups.flatMap((group) => refsIn(group.id, group.tabIds)))

// ── file system operations (explorer) ───────────────────────────────────────

const refreshTree = () => set({ treeVersion: get().treeVersion + 1 })

export { refreshTree }

export const collapseAllFolders = () =>
  set({ collapseVersion: get().collapseVersion + 1 })

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

export async function createFolderIn(dir: string, name: string) {
  try {
    await api.createDirectory(joinPath(dir, name))
    refreshTree()
  } catch (error) {
    toast.error(`تعذر إنشاء المجلد: ${errorMessage(error)}`)
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

  // Keep open tabs, in every group, pointing at the renamed files.
  const remap = (id: string) =>
    isInside(id, entry.path) ? newPath + id.slice(entry.path.length) : id
  const tabs = get().tabs.map((tab) => {
    if (tab.type !== "file" || !isInside(tab.path, entry.path)) return tab
    const path = remap(tab.path)
    editorRegistry.rekey(tab.id, path)
    return { ...tab, id: path, path, title: basename(path) }
  })
  const groups = get().groups.map((group) => ({
    ...group,
    tabIds: group.tabIds.map(remap),
    activeId: group.activeId ? remap(group.activeId) : null,
  }))
  commit({ tabs, groups })
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
  const affected = new Set(
    get()
      .tabs.filter((tab) => tab.type === "file" && isInside(tab.path, entry.path))
      .map((tab) => tab.id)
  )
  commit({
    groups: get().groups.map((group) => ({
      ...group,
      activeId: neighbourAfterRemoval(group, [...affected]),
      tabIds: group.tabIds.filter((id) => !affected.has(id)),
    })),
  })
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

  // Check up front so a missing interpreter becomes a call to action instead
  // of an error in the output panel.
  const interpreter = await refreshInterpreter({ notify: true })
  if (interpreter && !interpreter.found) return

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
