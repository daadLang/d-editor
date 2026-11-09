// A complete extension written without a build step. A real one would be built
// with `react` and `react/jsx-runtime` marked external (see docs/extension-development.md).
import { createElement as h, useEffect, useState } from "/host/react.js"

function Panel({ ctx }) {
  const [folder, setFolder] = useState(ctx.workspace.folder.get())
  useEffect(() => {
    const sub = ctx.workspace.folder.subscribe(setFolder)
    return () => sub.dispose()
  }, [])
  return h(
    "div",
    { className: "hello-panel" },
    h("p", null, "مرحبًا من إضافة مثبّتة!"),
    h("p", null, "المجلد المفتوح: ", h("strong", { dir: "ltr" }, folder ?? "—"))
  )
}

export function activate(ctx) {
  ctx.views.registerSidebarView({
    id: "hello",
    title: "مرحبًا",
    icon: () => h("span", { "aria-hidden": true }, "👋"),
    component: () => h(Panel, { ctx }),
    order: 40,
  })
  ctx.commands.register(
    "hello.say",
    () => ctx.ui.toast.info("مرحبًا!"),
    { title: "مرحبًا: قل مرحبًا" }
  )
}
