import { FolderSymlink, Package, RefreshCw } from "lucide-react"
import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ExtensionInfo, RegistryEntry } from "@/core/api"
import {
  installFromRegistry,
  isNewer,
  linkDev,
  loadRegistry,
  loadRegistryUrl,
  saveRegistryUrl,
  setEnabled,
  uninstall,
  useStore,
} from "@/extensions/extension-store/store"

const SOURCE_LABEL = { builtin: "مدمجة", dev: "تطوير", installed: "" } as const

function matches(filter: string, ...fields: (string | undefined)[]) {
  const needle = filter.trim().toLowerCase()
  return !needle || fields.some((field) => field?.toLowerCase().includes(needle))
}

function Card({
  title,
  version,
  badges,
  description,
  note,
  actions,
}: {
  title: string
  version: string
  badges?: React.ReactNode
  description?: string
  note?: React.ReactNode
  actions: React.ReactNode
}) {
  return (
    <li className="flex flex-col gap-1.5 border-b px-4 py-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="bidi-plaintext text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground" dir="ltr">
          {version}
        </span>
        {badges}
      </div>
      {description && <p className="bidi-plaintext text-xs text-muted-foreground">{description}</p>}
      {note}
      <div className="flex items-center gap-1.5 pt-0.5">{actions}</div>
    </li>
  )
}

function InstalledItem({ info }: { info: ExtensionInfo }) {
  const busy = useStore((state) => Boolean(state.busy[info.id]))
  return (
    <Card
      title={info.name}
      version={info.version}
      description={info.description}
      badges={
        <>
          {info.source !== "installed" && (
            <Badge variant="secondary">{SOURCE_LABEL[info.source]}</Badge>
          )}
          {info.status === "failed" && <Badge variant="destructive">تعذّر التشغيل</Badge>}
          {!info.enabled && <Badge variant="outline">معطّلة</Badge>}
        </>
      }
      note={info.error && <p className="text-xs text-destructive">{info.error}</p>}
      actions={
        <>
          {!info.locked && (
            <Button
              size="xs"
              variant="outline"
              disabled={busy}
              onClick={() => void setEnabled(info, !info.enabled)}
            >
              {info.enabled ? "تعطيل" : "تفعيل"}
            </Button>
          )}
          {info.source !== "builtin" && (
            <Button
              size="xs"
              variant="ghost"
              className="text-destructive"
              disabled={busy}
              onClick={() => void uninstall(info)}
            >
              {info.source === "dev" ? "إلغاء الربط" : "حذف"}
            </Button>
          )}
          {busy && <Spinner className="size-3" />}
        </>
      }
    />
  )
}

function BrowseItem({ entry }: { entry: RegistryEntry }) {
  const busy = useStore((state) => Boolean(state.busy[entry.id]))
  const current = useStore((state) => state.extensions.find((item) => item.id === entry.id))
  const update = current ? isNewer(entry.version, current.version) : false
  const label = !current ? "تثبيت" : update ? `تحديث إلى ${entry.version}` : "مثبّتة"

  return (
    <Card
      title={entry.name}
      version={entry.version}
      description={entry.description}
      note={
        <>
          {entry.authors?.length ? (
            <p className="text-xs text-muted-foreground">{entry.authors.join("، ")}</p>
          ) : null}
          {entry.permissions?.length ? (
            <p className="text-xs text-muted-foreground" dir="ltr">
              {entry.permissions.join(" · ")}
            </p>
          ) : null}
        </>
      }
      actions={
        <>
          <Button
            size="xs"
            disabled={busy || (Boolean(current) && !update)}
            onClick={() => void installFromRegistry(entry, update)}
          >
            {label}
          </Button>
          {busy && <Spinner className="size-3" />}
        </>
      }
    />
  )
}

function RegistrySettings() {
  const saved = useStore((state) => state.registryUrl)
  const [value, setValue] = useState(saved)
  useEffect(() => setValue(saved), [saved])

  return (
    <div className="flex flex-col gap-1.5 border-t px-4 py-3">
      <label className="text-xs text-muted-foreground" htmlFor="registry-url">
        عنوان سجل الإضافات
      </label>
      <Input
        id="registry-url"
        dir="ltr"
        value={value}
        className="h-7 text-xs"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void saveRegistryUrl(value)
        }}
      />
      <div className="flex gap-1.5">
        <Button size="xs" variant="outline" onClick={() => void saveRegistryUrl(value)}>
          حفظ
        </Button>
        <Button size="xs" variant="ghost" onClick={() => void saveRegistryUrl("")}>
          الافتراضي
        </Button>
      </div>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{children}</p>
}

function BrowseList() {
  const registry = useStore((state) => state.registry)
  const status = useStore((state) => state.registryStatus)
  const error = useStore((state) => state.registryError)
  const filter = useStore((state) => state.filter)

  if (status === "loading" && !registry) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    )
  }
  if (status === "error") {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button size="xs" variant="outline" onClick={() => void loadRegistry()}>
          إعادة المحاولة
        </Button>
      </div>
    )
  }
  const list = (registry ?? []).filter((entry) =>
    matches(filter, entry.id, entry.name, entry.description)
  )
  if (list.length === 0) {
    return <Empty>{registry?.length ? "لا توجد نتائج مطابقة" : "السجل لا يحتوي على إضافات بعد"}</Empty>
  }
  return (
    <ul>
      {list.map((entry) => (
        <BrowseItem key={entry.id} entry={entry} />
      ))}
    </ul>
  )
}

function InstalledList() {
  const extensions = useStore((state) => state.extensions)
  const filter = useStore((state) => state.filter)
  const list = extensions.filter((info) => matches(filter, info.id, info.name, info.description))
  if (list.length === 0) return <Empty>لا توجد إضافات مطابقة</Empty>
  return (
    <ul>
      {list.map((info) => (
        <InstalledItem key={info.id} info={info} />
      ))}
    </ul>
  )
}

/** Installed extensions and the registry. */
export function StorePanel() {
  const tab = useStore((state) => state.tab)
  const filter = useStore((state) => state.filter)
  const loading = useStore((state) => state.registryStatus === "loading")

  useEffect(() => {
    void loadRegistryUrl()
    if (tab === "browse" && useStore.getState().registry === null) void loadRegistry()
  }, [tab])

  return (
    <aside className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-8 shrink-0 items-center gap-1 ps-4 pe-2">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-sidebar-foreground/70">
          الإضافات
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="ربط إضافة قيد التطوير"
              onClick={() => void linkDev()}
            >
              <FolderSymlink />
            </Button>
          </TooltipTrigger>
          <TooltipContent>ربط إضافة قيد التطوير من مجلد</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="تحديث القائمة"
              disabled={loading}
              onClick={() => void loadRegistry()}
            >
              <RefreshCw className={loading ? "animate-spin" : undefined} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>تحديث قائمة السجل</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex flex-col gap-2 px-3 pb-2">
        <Input
          value={filter}
          placeholder="ابحث في الإضافات"
          aria-label="ابحث في الإضافات"
          className="h-8"
          onChange={(event) => useStore.setState({ filter: event.target.value })}
        />
        <Tabs
          value={tab}
          onValueChange={(value) => useStore.setState({ tab: value as "installed" | "browse" })}
        >
          <TabsList className="w-full">
            <TabsTrigger value="installed">
              <Package /> المثبّتة
            </TabsTrigger>
            <TabsTrigger value="browse">استعراض</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {tab === "installed" ? <InstalledList /> : <BrowseList />}
        {tab === "browse" && <RegistrySettings />}
      </ScrollArea>
    </aside>
  )
}
