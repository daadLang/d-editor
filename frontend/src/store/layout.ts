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
  panelPosition: "bottom",
  editorOrientation: "horizontal",
  resetCount: 0,
}

function load(): LayoutState {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
    return {
      sidebarOpen: parsed.sidebarOpen ?? DEFAULTS.sidebarOpen,
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
    const { sidebarOpen, panelPosition, editorOrientation } = state
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ sidebarOpen, panelPosition, editorOrientation })
    )
  } catch {
    // Storage can be unavailable; the layout then simply is not remembered.
  }
})

const set = useLayoutStore.setState
const get = useLayoutStore.getState

export const setSidebarOpen = (sidebarOpen: boolean) => set({ sidebarOpen })
export const toggleSidebar = () => set({ sidebarOpen: !get().sidebarOpen })

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
