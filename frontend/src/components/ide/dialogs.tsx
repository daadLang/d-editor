import { useEffect, useState, type FormEvent } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  answerSave,
  closeDialog,
  createFileIn,
  createProject,
  deleteEntry,
  renameEntry,
  useIdeStore,
} from "@/store/ide"

/** Characters that cannot appear in a single file or folder name. */
const INVALID_NAME = /[\\/:*?"<>|]/

function validateName(name: string) {
  const value = name.trim()
  if (!value) return "الاسم مطلوب"
  if (INVALID_NAME.test(value)) return 'الاسم لا يمكن أن يحتوي على \\ / : * ? " < > |'
  if (value === "." || value === "..") return "اسم غير صالح"
  return null
}

interface NameDialogProps {
  open: boolean
  title: string
  description: string
  label: string
  submitLabel: string
  initialValue?: string
  placeholder?: string
  onSubmit: (name: string) => void | Promise<void>
}

/** One name prompt reused for new project / new file / rename. */
function NameDialog({
  open,
  title,
  description,
  label,
  submitLabel,
  initialValue = "",
  placeholder,
  onSubmit,
}: NameDialogProps) {
  const [value, setValue] = useState(initialValue)
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (open) {
      setValue(initialValue)
      setTouched(false)
    }
  }, [open, initialValue])

  const error = touched ? validateName(value) : null

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (validateName(value)) return
    closeDialog()
    await onSubmit(value.trim())
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeDialog()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="name-input">{label}</FieldLabel>
            <Input
              id="name-input"
              autoFocus
              autoComplete="off"
              value={value}
              placeholder={placeholder}
              aria-invalid={Boolean(error)}
              className="bidi-plaintext"
              onChange={(event) => setValue(event.target.value)}
              onFocus={(event) => {
                // Select the base name so the extension survives a quick rename.
                const dot = event.target.value.lastIndexOf(".")
                event.target.setSelectionRange(0, dot > 0 ? dot : event.target.value.length)
              }}
            />
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog}>
              إلغاء
            </Button>
            <Button type="submit">{submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function AppDialogs() {
  const dialog = useIdeStore((state) => state.dialog)
  const confirmSave = useIdeStore((state) => state.confirmSave)

  return (
    <>
      <NameDialog
        open={dialog?.kind === "new-project"}
        title="إنشاء مشروع جديد"
        description="سيُنشأ مجلد للمشروع مع ملف رئيسي.ض جاهز للتشغيل."
        label="اسم المشروع"
        placeholder="أدخل اسم المشروع…"
        submitLabel="إنشاء"
        onSubmit={createProject}
      />

      <NameDialog
        open={dialog?.kind === "new-file"}
        title="ملف جديد"
        description="أدخل اسم الملف مع الامتداد."
        label="اسم الملف"
        placeholder="مثال.ض"
        submitLabel="إنشاء"
        initialValue="جديد.ض"
        onSubmit={async (name) => {
          if (dialog?.kind === "new-file") await createFileIn(dialog.dir, name)
        }}
      />

      <NameDialog
        open={dialog?.kind === "rename"}
        title="إعادة تسمية"
        description="أدخل الاسم الجديد."
        label="الاسم"
        submitLabel="حفظ"
        initialValue={dialog?.kind === "rename" ? dialog.entry.name : ""}
        onSubmit={async (name) => {
          if (dialog?.kind === "rename") await renameEntry(dialog.entry, name)
        }}
      />

      <AlertDialog
        open={dialog?.kind === "delete"}
        onOpenChange={(next) => !next && closeDialog()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              {dialog?.kind === "delete" && (
                <>
                  سيتم حذف <bdi className="font-medium text-foreground">{dialog.entry.name}</bdi>
                  {dialog.entry.isDirectory ? " وكل محتوياته" : ""} نهائيًا. لا يمكن التراجع عن هذا الإجراء.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => dialog?.kind === "delete" && void deleteEntry(dialog.entry)}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmSave !== null}
        onOpenChange={(next) => !next && answerSave("cancel")}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تغييرات غير محفوظة</AlertDialogTitle>
            <AlertDialogDescription>
              هل تريد حفظ التغييرات قبل الإغلاق؟
              {confirmSave && (
                <bdi className="mt-2 block font-medium text-foreground">
                  {confirmSave.names.join("، ")}
                </bdi>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <Button variant="outline" onClick={() => answerSave("discard")}>
              عدم الحفظ
            </Button>
            <AlertDialogAction onClick={() => answerSave("save")}>حفظ</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
