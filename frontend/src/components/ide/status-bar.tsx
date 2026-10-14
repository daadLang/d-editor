import { Circle, TerminalSquare, TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { getTheme } from "@/lib/themes"
import { useThemeStore } from "@/lib/theme-store"
import { isDesktop } from "@/lib/wails"
import { openSettings, selectActiveTab, toggleOutput, useIdeStore } from "@/store/ide"

export function StatusBar() {
  const tab = useIdeStore(selectActiveTab)
  const cursor = useIdeStore((state) => state.cursor)
  const running = useIdeStore((state) => state.output.running)
  const interpreter = useIdeStore((state) => state.interpreter)
  const themeKey = useThemeStore((state) => state.key)

  return (
    <footer className="flex h-7 shrink-0 items-center gap-2 border-t bg-card px-2 text-xs text-muted-foreground">
      <Button variant="ghost" size="xs" onClick={toggleOutput} className="h-5">
        <TerminalSquare />
        الإخراج
      </Button>
      {running && (
        <span className="flex items-center gap-1 text-primary">
          <Circle className="size-2 animate-pulse fill-current" />
          قيد التشغيل
        </span>
      )}
      {interpreter.status === "missing" && (
        <Button
          variant="ghost"
          size="xs"
          className="h-5 text-destructive hover:text-destructive"
          onClick={() => openSettings("interpreter")}
        >
          <TriangleAlert />
          لا يوجد مفسر — اضغط للإعداد
        </Button>
      )}
      {!isDesktop() && <span>(معاينة المتصفح)</span>}

      <div className="ms-auto flex h-full items-center gap-3">
        {interpreter.status === "ready" && (
          <>
            <button
              type="button"
              dir="ltr"
              title={interpreter.path}
              className="rounded px-1 hover:bg-accent hover:text-accent-foreground"
              onClick={() => openSettings("interpreter")}
            >
              {interpreter.label}
            </button>
            <Separator orientation="vertical" className="h-3.5" />
          </>
        )}
        {tab?.type === "file" && (
          <>
            <span dir="ltr">
              Ln {cursor.line}, Col {cursor.col}
            </span>
            <Separator orientation="vertical" className="h-3.5" />
            <span>ض</span>
            <Separator orientation="vertical" className="h-3.5" />
          </>
        )}
        <span dir="ltr">{getTheme(themeKey).label}</span>
      </div>
    </footer>
  )
}
