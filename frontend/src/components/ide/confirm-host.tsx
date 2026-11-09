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
import { answerConfirm, useConfirmStore } from "@/core/confirm"

/** Shows the question asked through `ctx.ui.confirm`. */
export function ConfirmHost() {
  const request = useConfirmStore((state) => state.request)

  return (
    <AlertDialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) answerConfirm(false)
      }}
    >
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle>{request?.title}</AlertDialogTitle>
          {request?.message && (
            <AlertDialogDescription className="whitespace-pre-line">
              {request.message}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{request?.cancelLabel ?? "إلغاء"}</AlertDialogCancel>
          <AlertDialogAction
            variant={request?.danger ? "destructive" : "default"}
            onClick={() => answerConfirm(true)}
          >
            {request?.confirmLabel ?? "موافق"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
