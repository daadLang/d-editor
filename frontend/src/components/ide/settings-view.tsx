import { useCallback, useEffect, useRef, useState } from "react"
import { Download, ExternalLink, FolderOpen, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { useThemeStore } from "@/lib/theme-store"
import { THEMES } from "@/lib/themes"
import { api, errorMessage, type InterpreterOption } from "@/lib/wails"
import { clearSettingsFocus, updateSettings, useIdeStore } from "@/store/ide"

const darkThemes = THEMES.filter((theme) => theme.category === "dark")
const lightThemes = THEMES.filter((theme) => theme.category === "light")

const DEFAULT_CHOICE = "__default__"

function ThemeField() {
  const key = useThemeStore((state) => state.key)
  const isDefault = useThemeStore((state) => state.isDefault)

  return (
    <Field>
      <FieldLabel htmlFor="theme">المظهر</FieldLabel>
      <Select
        value={isDefault ? DEFAULT_CHOICE : key}
        onValueChange={(value) =>
          void updateSettings({ theme: value === DEFAULT_CHOICE ? "" : value })
        }
      >
        <SelectTrigger id="theme" className="w-full max-w-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value={DEFAULT_CHOICE}>
              افتراضي (ضاد، يتبع نمط النظام)
            </SelectItem>
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>داكن</SelectLabel>
            {darkThemes.map((item) => (
              <SelectItem key={item.key} value={item.key}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>فاتح</SelectLabel>
            {lightThemes.map((item) => (
              <SelectItem key={item.key} value={item.key}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldDescription>
        يغيّر ألوان الواجهة والمحرر معًا، ويُحفظ تلقائيًا.
      </FieldDescription>
    </Field>
  )
}

function ProjectPathField() {
  const projectPath = useIdeStore((state) => state.settings.projectPath)

  const choose = async () => {
    try {
      const selected = await api.selectProjectPath()
      if (selected) await updateSettings({ projectPath: selected })
    } catch (error) {
      toast.error(`تعذر اختيار المسار: ${errorMessage(error)}`)
    }
  }

  return (
    <Field>
      <FieldLabel htmlFor="project-path">المسار الافتراضي لإنشاء المشاريع</FieldLabel>
      <InputGroup className="max-w-xl">
        <InputGroupInput
          id="project-path"
          dir="ltr"
          readOnly
          value={projectPath}
          className="text-start"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton onClick={() => void choose()}>
            <FolderOpen />
            اختيار…
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </Field>
  )
}

const SOURCE_LABEL: Record<string, string> = {
  system: "النظام",
  downloaded: "مثبّت من IDE",
  custom: "مخصص",
}

function OptionBadges({ option }: { option: InterpreterOption }) {
  return (
    <span className="ms-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      {option.installed ? (SOURCE_LABEL[option.source] ?? "مثبت") : "متاح للتنزيل"}
      {option.latest && <Badge variant="secondary">الأحدث</Badge>}
    </span>
  )
}

function InterpreterSection() {
  const current = useIdeStore((state) => state.interpreter)
  const focus = useIdeStore((state) => state.settingsFocus)
  const [options, setOptions] = useState<InterpreterOption[] | null>(null)
  const [selectedId, setSelectedId] = useState("")
  const [installing, setInstalling] = useState(false)
  const sectionRef = useRef<HTMLDivElement>(null)

  // Arriving from the "no interpreter" notification scrolls straight here.
  useEffect(() => {
    if (focus?.section !== "interpreter") return
    sectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" })
    clearSettingsFocus()
  }, [focus])

  const refresh = useCallback(async () => {
    setOptions(null)
    // Read the live value: this callback is created once and must not use a
    // stale path (e.g. right after installing a new interpreter).
    const interpreterPath = useIdeStore.getState().settings.interpreterPath
    try {
      const list = await api.listInterpreters(interpreterPath)
      setOptions(list)
      // Prefer what is in use; with nothing in use, offer the newest release so
      // installing it is a single click.
      setSelectedId(
        (
          list.find((o) => o.path && o.path === interpreterPath) ??
          list.find((o) => o.selected) ??
          (interpreterPath ? undefined : list.find((o) => o.latest && !o.installed)) ??
          list.find((o) => o.installed) ??
          list[0]
        )?.id ?? ""
      )
    } catch (error) {
      setOptions([])
      toast.error(`تعذر تحميل قائمة المفسرات: ${errorMessage(error)}`)
    }
    // Reload only when the page opens or the user presses refresh; choosing an
    // option changes `interpreterPath` and must not reshuffle the list.
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const selected = options?.find((option) => option.id === selectedId)
  const canInstall = Boolean(selected?.releaseTag) && !selected?.installed
  const hasInstalled = options?.some((option) => option.installed) ?? false

  const choose = (id: string) => {
    setSelectedId(id)
    const option = options?.find((o) => o.id === id)
    if (option?.installed && option.path) {
      void updateSettings({ interpreterPath: option.path })
      toast.success(`تم اختيار ${option.label}`, { duration: 1500 })
    }
  }

  const pickFile = async () => {
    try {
      const path = await api.selectInterpreter()
      if (!path) return
      await updateSettings({ interpreterPath: path })
      await refresh()
      toast.success("تم اختيار المفسر", { duration: 1500 })
    } catch (error) {
      toast.error(`تعذر اختيار المفسر: ${errorMessage(error)}`)
    }
  }

  const install = async () => {
    if (!selected?.releaseTag) return
    setInstalling(true)
    try {
      const path = await api.installInterpreter(selected.releaseTag)
      await updateSettings({ interpreterPath: path })
      await refresh()
      toast.success(`تم تثبيت ${selected.label} وتعيينه كمفسر حالي`)
    } catch (error) {
      toast.error(`تعذر تثبيت المفسر: ${errorMessage(error)}`)
    } finally {
      setInstalling(false)
    }
  }

  const ready = current.status === "ready"

  return (
    <div ref={sectionRef} className="scroll-mt-4">
      <FieldSet>
        <FieldLegend>مفسر ضاد</FieldLegend>
        <FieldDescription>
          اختر مفسرًا مثبتًا أو إصدارًا مقترحًا لتنزيله من مستودع ضاد الرسمي.
        </FieldDescription>

        <Alert variant={ready || current.status === "unknown" ? "default" : "destructive"} className="max-w-xl">
          <AlertTitle className="flex items-center gap-2">
            {ready ? "المفسر الحالي" : "لم يتم اختيار مفسر"}
            {ready && (
              <Badge variant="secondary" dir="ltr">
                {current.label}
              </Badge>
            )}
            {ready && current.source && SOURCE_LABEL[current.source] && (
              <span className="text-xs font-normal text-muted-foreground">
                {SOURCE_LABEL[current.source]}
              </span>
            )}
          </AlertTitle>
          <AlertDescription dir={ready ? "ltr" : undefined} className="break-all text-start">
            {ready
              ? current.path
              : "اختر مفسرًا من القائمة لتتمكن من تشغيل البرامج."}
          </AlertDescription>
        </Alert>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="interpreter">الإصدار</FieldLabel>
            <div className="flex max-w-xl items-center gap-2">
              <Select
                value={selectedId}
                onValueChange={choose}
                disabled={options === null || options.length === 0}
              >
                <SelectTrigger id="interpreter" className="w-full">
                  {options === null ? (
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Spinner /> جارٍ تحميل المفسرات…
                    </span>
                  ) : (
                    <SelectValue placeholder="لم يتم العثور على مفسرات متوافقة" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {options?.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      <span dir="ltr">{option.label}</span>
                      <OptionBadges option={option} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                title="تحديث القائمة"
                aria-label="تحديث القائمة"
                disabled={options === null}
                onClick={() => void refresh()}
              >
                <RefreshCw className={options === null ? "animate-spin" : undefined} />
              </Button>
            </div>
            {options?.length === 0 && (
              <FieldDescription>
                تعذر جلب الإصدارات المتاحة. تحقق من اتصالك بالإنترنت أو اختر ملف المفسر يدويًا.
              </FieldDescription>
            )}
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={hasInstalled ? "secondary" : "default"}
              disabled={!canInstall || installing}
              onClick={() => void install()}
            >
              {installing ? <Spinner /> : <Download />}
              {installing ? (
                "جارٍ التثبيت…"
              ) : (
                <>
                  تثبيت <span dir="ltr">{selected?.label ?? "المحدد"}</span>
                </>
              )}
            </Button>
            <Button variant="outline" onClick={() => void pickFile()}>
              <FolderOpen />
              اختيار ملف…
            </Button>
            {selected?.releaseUrl && (
              <Button
                variant="link"
                onClick={() => void api.openExternalUrl(selected.releaseUrl)}
              >
                <ExternalLink />
                صفحة الإصدار <span dir="ltr">{selected.releaseTag}</span>
              </Button>
            )}
          </div>
        </FieldGroup>
      </FieldSet>
    </div>
  )
}

export function SettingsView() {
  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-3xl p-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">الإعدادات</h1>
          <p className="text-sm text-muted-foreground">إعدادات عامة للمشروع والمظهر.</p>
        </header>

        <FieldGroup>
          <ProjectPathField />
          <FieldSeparator />
          <ThemeField />
          <FieldSeparator />
          <InterpreterSection />
        </FieldGroup>
      </div>
    </ScrollArea>
  )
}

