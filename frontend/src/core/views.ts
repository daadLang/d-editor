import type { ComponentType } from "react"
import { create } from "zustand"

import { registerCommand } from "@/core/commands"
import { toDisposable, type Disposable } from "@/core/disposable"
import { showSidebarView } from "@/store/layout"

/** Fired on `window` each time a view is revealed by its command or shortcut. */
export const VIEW_SHOWN_EVENT = "daad:view-shown"

/** A panel an extension adds to the side bar, with an icon on the activity bar. */
export interface SidebarView {
  id: string
  title: string
  icon: ComponentType
  component: ComponentType
  /** Lower comes first on the activity bar. */
  order?: number
  /** Shortcut that reveals the view, e.g. `Mod+Shift+KeyE`. */
  keybinding?: string
}

interface ViewState {
  views: SidebarView[]
}

export const useViewStore = create<ViewState>()(() => ({ views: [] }))

export function registerSidebarView(view: SidebarView): Disposable {
  useViewStore.setState((state) => ({
    views: [...state.views.filter((item) => item.id !== view.id), view].sort(
      (a, b) => (a.order ?? 100) - (b.order ?? 100)
    ),
  }))
  const command = registerCommand(`view.show.${view.id}`, () => {
      showSidebarView(view.id)
      // Lets a view that is already mounted react (e.g. take focus).
      window.dispatchEvent(new CustomEvent(VIEW_SHOWN_EVENT, { detail: view.id }))
    }, {
    title: `إظهار: ${view.title}`,
    icon: view.icon,
    keybinding: view.keybinding,
  })
  return toDisposable(() => {
    command.dispose()
    useViewStore.setState((state) => ({
      views: state.views.filter((item) => item !== view),
    }))
  })
}
