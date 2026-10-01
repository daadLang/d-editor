import { useCallback, useEffect, useState } from "react"
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
import { THEMES } from "@/lib/themes"
import { api, errorMessage, type InterpreterOption } from "@/lib/wails"
import { updateSettings, useIdeStore } from "@/store/ide"

const darkThemes = THEMES.filter((theme) => theme.category === "dark")
const lightThemes = THEMES.filter((theme) => theme.category === "light")

function ThemeField() {
  const theme = useIdeStore((state) => state.settings.theme)

  return (
    <Field>
      <FieldLabel htmlFor="theme">المظهر</FieldLabel>
      <Select value={theme} onValueChange={(value) => void updateSettings({ theme: value })}>
        <SelectTrigger id="theme" className="w-full max-w-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
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

function InterpreterSection() {
  const interpreterPath = useIdeStore((state) => state.settings.interpreterPath)
  const [options, setOptions] = useState<InterpreterOption[] | null>(null)
  const [selectedId, setSelectedId] = useState("")
  const [installing, setInstalling] = useState(false)

  const refresh = useCallback(async () => {
    setOptions(null)
    try {
      const list = await api.listInterpreters(interpreterPath)
      setOptions(list)
      setSelectedId(
        (list.find((o) => o.path && o.path === interpreterPath) ??
          list.find((o) => o.selected) ??
          list[0])?.id ?? ""
      )
    } catch (error) {
      setOptions([])
      toast.error(`تعذر تحميل قائمة المفسرات: ${errorMessage(error)}`)
    }
    // Reload only when the page opens or the user presses refresh; choosing an
    // option changes `interpreterPath` and must not reshuffle the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const selected = options?.find((option) => option.id === selectedId)
  const active = options?.find((option) => option.path && option.path === interpreterPath)
  const canInstall = Boolean(selected?.releaseTag) && !selected?.installed

  const choose = (id: string) => {
    setSelectedId(id)
    const option = options?.find((o) => o.id === id)
    if (option?.path) {
      void updateSettings({ interpreterPath: option.path })
      toast.success("تم اختيار المفسر", { duration: 1500 })
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
      toast.success("تم تثبيت المفسر وتعيينه كمفسر حالي")
    } catch (error) {
      toast.error(`تعذر تثبيت المفسر: ${errorMessage(error)}`)
    } finally {
      setInstalling(false)
    }
  }

  return (
    <FieldSet>
      <FieldLegend>مفسر ضاد</FieldLegend>
      <FieldDescription>
        اختر مفسرًا مثبتًا أو إصدارًا مقترحًا لتنزيله من مستودع ضاد الرسمي.
      </FieldDescription>

      <Alert variant={interpreterPath ? "default" : "destructive"} className="max-w-xl">
        <AlertTitle className="flex items-center gap-2">
          {interpreterPath ? "المفسر الحالي" : "لم يتم اختيار مفسر"}
          {active?.version && (
            <Badge variant="secondary" dir="ltr">
              {active.version}
            </Badge>
          )}
        </AlertTitle>
        <AlertDescription
          dir={interpreterPath ? "ltr" : undefined}
          className="break-all text-start"
        >
          {interpreterPath || "اختر مفسرًا من القائمة لتتمكن من تشغيل البرامج."}
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
                    <span className="text-muted-foreground">
                      {option.installed ? "· مثبت" : "· متاح للتنزيل"}
                    </span>
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
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={!canInstall || installing} onClick={() => void install()}>
            {installing ? <Spinner /> : <Download />}
            {installing ? "جارٍ التثبيت…" : "تثبيت المحدد"}
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

