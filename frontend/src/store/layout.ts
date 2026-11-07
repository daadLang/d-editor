import { create } from "zustand"

/**
 * Arrangement of the workbench: what is visible and where it is docked.
 * Panel *sizes* are stored separately by react-resizable-panels (see
 * `usePersistedLayout`); this holds the structural choices.
 */
export type PanelPosition = "bottom" | "side"
export type EditorOrientation = "horizontal" | "vertical"

interface LayoutState {
  sidebarOpen: boolean
  /** Id of the side bar view shown; null until the user picks one. */
  activeSidebarView: string | null
  /** Where the output panel is docked. */
  panelPosition: PanelPosition
  /** How editor groups are arranged: side by side or stacked. */
  editorOrientation: EditorOrientation
  /** Bumped by "reset layout" so panel groups drop their remembered sizes. */
  resetCount: number
}

const STORAGE_KEY = "daad-ide:layout"
const DEFAULTS: LayoutState = {
  sidebarOpen: true,
  activeSidebarView: null,
  panelPosition: "bottom",
  editorOrientation: "horizontal",
  resetCount: 0,
}

function load(): LayoutState {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
    return {
      sidebarOpen: parsed.sidebarOpen ?? DEFAULTS.sidebarOpen,
      activeSidebarView:
        typeof parsed.activeSidebarView === "string" ? parsed.activeSidebarView : null,
      panelPosition: parsed.panelPosition === "side" ? "side" : "bottom",
      editorOrientation:
        parsed.editorOrientation === "vertical" ? "vertical" : "horizontal",
      resetCount: 0,
    }
  } catch {
    return DEFAULTS
  }
}

export const useLayoutStore = create<LayoutState>()(() => load())

useLayoutStore.subscribe((state) => {
  try {
    const { sidebarOpen, activeSidebarView, panelPosition, editorOrientation } = state
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ sidebarOpen, activeSidebarView, panelPosition, editorOrientation })
    )
  } catch {
    // Storage can be unavailable; the layout then simply is not remembered.
  }
})

const set = useLayoutStore.setState
const get = useLayoutStore.getState

export const setSidebarOpen = (sidebarOpen: boolean) => set({ sidebarOpen })
export const toggleSidebar = () => set({ sidebarOpen: !get().sidebarOpen })

/** Reveals a side bar view, opening the side bar if it is closed. */
export const showSidebarView = (id: string) =>
  set({ activeSidebarView: id, sidebarOpen: true })

/**
 * Activity bar click: selects the view, or closes the side bar when the
 * view is already the one showing (like VS Code).
 */
export function toggleSidebarView(id: string, currentId: string | null) {
  if (get().sidebarOpen && currentId === id) set({ sidebarOpen: false })
  else showSidebarView(id)
}

export const togglePanelPosition = () =>
  set({ panelPosition: get().panelPosition === "bottom" ? "side" : "bottom" })

export const toggleEditorOrientation = () =>
  set({
    editorOrientation:
      get().editorOrientation === "horizontal" ? "vertical" : "horizontal",
  })

/** Restores the default arrangement and panel sizes. */
export function resetLayout() {
  try {
    Object.keys(localStorage)
      .filter((name) => name.startsWith("react-resizable-panels:"))
      .forEach((name) => localStorage.removeItem(name))
  } catch {
    // ignore
  }
  set({ ...DEFAULTS, resetCount: get().resetCount + 1 })
}
