export function activate(ctx) {
  ctx.commands.register(
    "hello-command.run",
    () => ctx.ui.toast.info("تم تنفيذ الأمر التجريبي"),
    { title: "أمر تجريبي" }
  )
}
