# Writing an extension

An extension is a folder (or a `.tar.gz` of one) with an `extension.json` and a JavaScript module that exports `activate`.

```
my-extension/
  extension.json
  index.js
  style.css        (optional)
```

```json
{
  "id": "my-extension",
  "name": "إضافتي",
  "version": "1.0.0",
  "description": "ماذا تفعل",
  "main": "index.js",
  "styles": ["style.css"],
  "permissions": ["workspace.read"],
  "api": 1
}
```

- `id`: lowercase letters, digits and hyphens. It must not equal a built-in id (`explorer`, `search`, `extension-store`).
- `version`: `x.y.z`.
- `api`: the extension API version you built against. The IDE refuses an extension that needs a newer one (current: 1).
- `permissions`: shown to the user before install. Informational in v1: extensions run with the IDE's full privileges, so only install code you trust.

## The module

```js
export function activate(ctx) {
  ctx.commands.register("my-extension.hello", () => ctx.ui.toast.info("مرحبًا"), {
    title: "إضافتي: مرحبًا",
  })
}
export function deactivate() {} // optional
```

Anything registered through `ctx` is released when the extension is disabled or removed. Types are in `frontend/src/core/api.ts` (`ExtensionContext`). Available in v1: `commands`, `views.registerSidebarView`, `workspace` (folder, change events, read-only fs), `editor.openFile(path, { line, column, length })`, `findText`, `replaceText`, `extensions` (management), `ui.confirm` and `ui.toast`.

## UI and React

The IDE shares its copy of React with extensions. Mark `react` and `react/jsx-runtime` **external** and map them to the IDE's shims so there is only one React in the page:

```ts
// vite.config.ts of an extension
export default defineConfig({
  build: {
    lib: { entry: "src/index.tsx", formats: ["es"], fileName: () => "index.js" },
    rollupOptions: {
      external: ["react", "react/jsx-runtime"],
      output: { paths: { react: "/host/react.js", "react/jsx-runtime": "/host/jsx-runtime.js" } },
    },
  },
})
```

Do not rely on the IDE's Tailwind classes: ship your own CSS in `styles`. Use logical properties (`padding-inline-start`, `margin-inline-end`) so the UI works in RTL.

The production CSP allows scripts only from the app's own origin. Extension files are served by the Go side at `/_ext/<id>/...`, so no `eval`, remote scripts or inline scripts. Remote `fetch` is blocked too (`connect-src 'self'`).

## Trying it

- **Dev link:** in the store, press "ربط إضافة قيد التطوير" and pick your folder. It is served in place and reloaded each time you link it again; unlinking never deletes your folder.
- **Browser preview** (`yarn dev`, no Go): `frontend/dev-extensions/hello` is a complete example, installable from the mock registry in the store.
- **Package:** `tar -czf my-extension-1.0.0.tar.gz -C my-extension .` Registry entry:

```json
{ "schema": 1, "extensions": [{
  "id": "my-extension", "name": "إضافتي", "version": "1.0.0", "api": 1,
  "download": { "url": "my-extension-1.0.0.tar.gz", "sha256": "<sha256 of the file>" }
}]}
```

A relative `download.url` resolves against the index's location.
