import {
  CaseSensitive,
  ChevronDown,
  ChevronLeft,
  Regex,
  Replace,
  ReplaceAll,
  SlidersHorizontal,
  WholeWord,
  Languages,
  X,
} from "lucide-react"
import { useEffect, useRef } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { SearchMatch } from "@/core/api"
import { VIEW_SHOWN_EVENT } from "@/core/views"
import { FOCUS_REPLACE_EVENT } from "@/extensions/search/events"
import { cn } from "@/lib/utils"
import { basename, dirname } from "@/lib/path"
import { useIdeStore } from "@/store/ide"
import {
  clearResults,
  dismissFile,
  dismissMatch,
  openMatch,
  replaceEverywhere,
  replaceInFile,
  replaceMatch,
  runSearch,
  toggleCollapsed,
  useSearchStore,
} from "@/extensions/search/store"

type OptionKey = "caseSensitive" | "wholeWord" | "regex" | "ignoreDiacritics"

function Toggle({
  option,
  label,
  children,
}: {
  option: OptionKey
  label: string
  children: React.ReactNode
}) {
  const on = useSearchStore((state) => state[option])
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          aria-pressed={on}
          className={cn(on && "bg-primary/15 text-primary hover:bg-primary/20")}
          onClick={() => useSearchStore.setState({ [option]: !on })}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** The match, highlighted inside its line. */
function Preview({ match }: { match: SearchMatch }) {
  const { preview, previewStart: start, length } = match
  const replacing = useSearchStore((state) => state.showReplace)
  const replacement = useSearchStore((state) => state.replacement)
  const regex = useSearchStore((state) => state.regex)
  const found = preview.slice(start, start + length)
  return (
    <span
      className="bidi-plaintext block h-6 min-w-0 max-w-full flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-start font-mono text-xs leading-6"
      dir="auto"
    >
      {preview.slice(0, start)}
      {replacing ? (
        <>
          <del className="rounded-sm bg-destructive/25 text-foreground">{found}</del>
          {/* A regex replacement depends on the groups; the real text is only known to the backend. */}
          {!regex && replacement !== "" && (
            <ins className="rounded-sm bg-emerald-500/25 no-underline text-foreground">
              {replacement}
            </ins>
          )}
        </>
      ) : (
        <mark className="rounded-sm bg-primary/30 text-foreground">{found}</mark>
      )}
      {preview.slice(start + length)}
    </span>
  )
}

function RowAction({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function relative(path: string, folder: string | null) {
  if (!folder) return dirname(path)
  const dir = dirname(path)
  return dir.length > folder.length ? dir.slice(folder.length + 1) : ""
}

function Results({ folder }: { folder: string | null }) {
  const files = useSearchStore((state) => state.files)
  const collapsed = useSearchStore((state) => state.collapsed)
  const replacing = useSearchStore((state) => state.showReplace)
  const idle = useSearchStore((state) => state.status === "done")

  return (
    <ul className="pb-4">
      {files.map((file) => {
        const closed = collapsed[file.path]
        const Chevron = closed ? ChevronLeft : ChevronDown
        const where = relative(file.path, folder)
        return (
          <li key={file.path}>
            <div className="group grid h-7 min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center overflow-hidden hover:bg-sidebar-accent">
              <button
                type="button"
                className="flex h-full min-w-0 items-center gap-1 overflow-hidden ps-2 text-start text-sm"
                onClick={() => toggleCollapsed(file.path)}
              >
                <Chevron className="size-4 shrink-0 text-muted-foreground" />
                <span className="bidi-plaintext truncate">{basename(file.path)}</span>
                {where && (
                  <span className="bidi-plaintext truncate text-xs text-muted-foreground" dir="ltr">
                    {where}
                  </span>
                )}
              </button>
              <span className="flex shrink-0" dir="ltr">
                {replacing && idle && (
                  <RowAction label="استبدال في هذا الملف" onClick={() => void replaceInFile(file.path)}>
                    <ReplaceAll />
                  </RowAction>
                )}
                <RowAction label="تجاهل هذا الملف" onClick={() => dismissFile(file.path)}>
                  <X />
                </RowAction>
              </span>
              <span className="mx-2 shrink-0 rounded-full bg-muted px-1.5 text-xs tabular-nums">
                {file.matches.length}
              </span>
            </div>
            {!closed &&
              file.matches.map((match, index) => (
                <div
                  key={`${match.line}:${match.column}:${index}`}
                  className="group grid h-6 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center overflow-hidden hover:bg-sidebar-accent"
                >
                  <button
                    type="button"
                    title={`${match.line}:${match.column}`}
                    dir="auto"
                    className="flex h-6 min-w-0 items-center overflow-hidden ps-8 pe-2 text-start"
                    onClick={() => openMatch(file.path, match.line, match.column, match.length)}
                  >
                    <Preview match={match} />
                  </button>
                  <span className="flex shrink-0 pe-1" dir="ltr">
                    {replacing && idle && (
                      <RowAction label="استبدال" onClick={() => void replaceMatch(file.path, match)}>
                        <Replace />
                      </RowAction>
                    )}
                    <RowAction label="تجاهل هذه النتيجة" onClick={() => dismissMatch(file.path, match)}>
                      <X />
                    </RowAction>
                  </span>
                </div>
              ))}
          </li>
        )
      })}
    </ul>
  )
}

function Status() {
  const status = useSearchStore((state) => state.status)
  const summary = useSearchStore((state) => state.summary)
  const error = useSearchStore((state) => state.error)
  const files = useSearchStore((state) => state.files)
  const count = files.length
  const matchCount = files.reduce((n, file) => n + file.matches.length, 0)

  if (status === "error") {
    return <p className="px-4 py-2 text-xs text-destructive">{error}</p>
  }
  if (status === "running") {
    return (
      <p className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground">
        <Spinner className="size-3" /> جارٍ البحث… ({count} ملف)
      </p>
    )
  }
  if (status === "done" && summary) {
    if (matchCount === 0) {
      return <p className="px-4 py-2 text-xs text-muted-foreground">لا توجد نتائج</p>
    }
    return (
      <p className="px-4 py-2 text-xs text-muted-foreground">
        {matchCount} نتيجة في {count} ملف
        {summary.truncated && " (النتائج مقتطعة، حدّد البحث أكثر)"}
      </p>
    )
  }
  return null
}

/** Find in files. */
export function SearchPanel() {
  const folder = useIdeStore((state) => state.folder)
  const query = useSearchStore((state) => state.query)
  const caseSensitive = useSearchStore((state) => state.caseSensitive)
  const wholeWord = useSearchStore((state) => state.wholeWord)
  const regex = useSearchStore((state) => state.regex)
  const ignoreDiacritics = useSearchStore((state) => state.ignoreDiacritics)
  const include = useSearchStore((state) => state.include)
  const exclude = useSearchStore((state) => state.exclude)
  const showFilters = useSearchStore((state) => state.showFilters)
  const showReplace = useSearchStore((state) => state.showReplace)
  const replacement = useSearchStore((state) => state.replacement)
  const canReplace = useSearchStore((state) => state.status === "done" && state.files.length > 0)
  const inputRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<HTMLInputElement>(null)

  // Searching as you type, but not on every keystroke.
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const timer = setTimeout(() => void runSearch(), 300)
    return () => clearTimeout(timer)
  }, [query, caseSensitive, wholeWord, regex, ignoreDiacritics, include, exclude, folder])

  // The "focus search" command asks for the box to take focus.
  useEffect(() => {
    const focus = () => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    focus()
    const onShown = (event: Event) => {
      if ((event as CustomEvent<string>).detail === "search") focus()
    }
    const onReplace = () => setTimeout(() => replaceRef.current?.focus(), 0)
    window.addEventListener(VIEW_SHOWN_EVENT, onShown)
    window.addEventListener(FOCUS_REPLACE_EVENT, onReplace)
    return () => {
      window.removeEventListener(VIEW_SHOWN_EVENT, onShown)
      window.removeEventListener(FOCUS_REPLACE_EVENT, onReplace)
    }
  }, [])

  return (
    <aside className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-8 shrink-0 items-center ps-4 pe-2">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-sidebar-foreground/70">
          بحث
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="مسح النتائج"
              onClick={() => {
                useSearchStore.setState({ query: "" })
                clearResults()
                inputRef.current?.focus()
              }}
            >
              <X />
            </Button>
          </TooltipTrigger>
          <TooltipContent>مسح النتائج</TooltipContent>
        </Tooltip>
      </div>

      {!folder ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          افتح مجلدًا لتتمكن من البحث في ملفاته
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2 px-3 pb-1">
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="إظهار الاستبدال"
                    aria-pressed={showReplace}
                    onClick={() => useSearchStore.setState({ showReplace: !showReplace })}
                  >
                    {showReplace ? <ChevronDown /> : <ChevronLeft />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{showReplace ? "إخفاء الاستبدال" : "إظهار الاستبدال"}</TooltipContent>
              </Tooltip>
              <Input
                ref={inputRef}
                value={query}
                placeholder="بحث"
                aria-label="نص البحث"
                className="h-8 min-w-0 flex-1"
                onChange={(event) => useSearchStore.setState({ query: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void runSearch()
                }}
              />
            </div>
            {showReplace && (
              <div className="flex items-center gap-1">
                <span className="size-6 shrink-0" />
                <Input
                  ref={replaceRef}
                  value={replacement}
                  placeholder={regex ? "استبدال ($1 للمجموعات)" : "استبدال"}
                  aria-label="نص الاستبدال"
                  className="h-8 min-w-0 flex-1"
                  onChange={(event) => useSearchStore.setState({ replacement: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && canReplace) void replaceEverywhere()
                  }}
                />
                <RowAction label="استبدال الكل" onClick={() => void replaceEverywhere()}>
                  <ReplaceAll className={canReplace ? undefined : "opacity-40"} />
                </RowAction>
              </div>
            )}
            <div className="flex items-center gap-0.5">
              <Toggle option="caseSensitive" label="مطابقة حالة الأحرف">
                <CaseSensitive />
              </Toggle>
              <Toggle option="wholeWord" label="كلمة كاملة">
                <WholeWord />
              </Toggle>
              <Toggle option="regex" label="تعبير نمطي">
                <Regex />
              </Toggle>
              <Toggle option="ignoreDiacritics" label="تجاهل التشكيل وتوحيد الألف والياء">
                <Languages />
              </Toggle>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="ms-auto"
                    aria-label="تصفية الملفات"
                    aria-pressed={showFilters}
                    onClick={() => useSearchStore.setState({ showFilters: !showFilters })}
                  >
                    <SlidersHorizontal />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>تصفية الملفات</TooltipContent>
              </Tooltip>
            </div>
            {showFilters && (
              <div className="flex flex-col gap-1.5">
                <Input
                  dir="ltr"
                  value={include}
                  placeholder="تضمين: *.daad, src/**"
                  aria-label="الملفات المضمّنة"
                  className="h-7 text-xs"
                  onChange={(event) => useSearchStore.setState({ include: event.target.value })}
                />
                <Input
                  dir="ltr"
                  value={exclude}
                  placeholder="استبعاد: **/*.min.js"
                  aria-label="الملفات المستبعدة"
                  className="h-7 text-xs"
                  onChange={(event) => useSearchStore.setState({ exclude: event.target.value })}
                />
              </div>
            )}
          </div>
          <Status />
          <ScrollArea className="min-h-0 flex-1">
            <Results folder={folder} />
          </ScrollArea>
        </>
      )}
    </aside>
  )
}
