import { Settings } from "lucide-react"

import { Shortcut } from "@/components/ide/shortcut"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { executeCommand } from "@/core/commands"
import { keybindingLabels } from "@/core/keybindings"
import { useViewStore } from "@/core/views"
import { useLogo } from "@/hooks/use-logo"
import { cn } from "@/lib/utils"
import { toggleSidebarView, useLayoutStore } from "@/store/layout"

/** The id of the view the side bar shows: the chosen one, else the first. */
export function useActiveViewId() {
  const views = useViewStore((state) => state.views)
  const chosen = useLayoutStore((state) => state.activeSidebarView)
  return views.find((view) => view.id === chosen)?.id ?? views[0]?.id ?? null
}

/**
 * The narrow icon rail: one button per sidebar view contributed by an
 * extension, and the settings button at the end.
 */
export function ActivityBar() {
  const views = useViewStore((state) => state.views)
  const sidebarOpen = useLayoutStore((state) => state.sidebarOpen)
  const activeId = useActiveViewId()
  const logo = useLogo()

  return (
    <nav
      aria-label="الأنشطة"
      className="flex w-12 shrink-0 flex-col items-center gap-1 border-e bg-sidebar py-2 text-sidebar-foreground"
    >
      <img src={logo} alt="" className="mb-2 size-7 object-contain" />

      {views.map((view) => {
        const Icon = view.icon
        const active = sidebarOpen && activeId === view.id
        return (
          <Tooltip key={view.id}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={view.title}
                aria-pressed={active}
                className={cn(active && "bg-sidebar-accent text-sidebar-accent-foreground")}
                onClick={() => toggleSidebarView(view.id, activeId)}
              >
                <Icon />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              {view.title}{" "}
              {view.keybinding && <Shortcut keys={keybindingLabels(view.keybinding)} />}
            </TooltipContent>
          </Tooltip>
        )
      })}

      <div className="mt-auto">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="الإعدادات"
              onClick={() => void executeCommand("settings.open")}
            >
              <Settings />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">الإعدادات</TooltipContent>
        </Tooltip>
      </div>
    </nav>
  )
}
