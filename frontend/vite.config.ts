import { createReadStream, existsSync, statSync } from "node:fs"
import { extname, resolve, sep } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import wails from "@wailsio/runtime/plugins/vite"
import { defineConfig } from "vite"

// The strict CSP only applies to production builds: the dev server needs
// inline scripts for React Fast Refresh.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ")

const contentSecurityPolicy = {
  name: "daad-csp",
  apply: "build" as const,
  transformIndexHtml: (html: string) =>
    html.replace(
      "<!--csp-->",
      `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`
    ),
}

// Browser-only preview (the mock backend, no Go): serves frontend/dev-extensions
// at /mock-ext/<id>/..., standing in for the Go handler that serves /_ext/<id>/...
const devExtensionsDir = resolve(import.meta.dirname, "dev-extensions")
const MOCK_TYPES: Record<string, string> = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
}
const devExtensions = {
  name: "daad-dev-extensions",
  apply: "serve" as const,
  configureServer(server: import("vite").ViteDevServer) {
    server.middlewares.use("/mock-ext", (req, res, next) => {
      const path = resolve(devExtensionsDir, "." + decodeURIComponent((req.url ?? "").split("?")[0]))
      if (!path.startsWith(devExtensionsDir + sep) || !existsSync(path) || !statSync(path).isFile()) {
        return next()
      }
      res.setHeader("Content-Type", MOCK_TYPES[extname(path)] ?? "application/octet-stream")
      res.setHeader("Cache-Control", "no-store")
      createReadStream(path).pipe(res)
    })
  },
}

// The Wails plugin wires up typed events from the generated bindings, so the
// build fails unless `wails3 generate bindings` has run. `wails3 dev` and
// `wails3 build` always run it first; a plain `yarn dev` (browser-only UI work
// with the mock backend) has no bindings, so the plugin is skipped there.
const hasBindings = existsSync(
  resolve(
    import.meta.dirname,
    "bindings/github.com/wailsapp/wails/v3/internal/eventcreate"
  )
)

// `wails3 dev` starts this server on WAILS_VITE_PORT (9245 by default) and
// points the desktop window at it. The production build is written to
// frontend/dist, which main.go embeds.
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    contentSecurityPolicy,
    devExtensions,
    ...(hasBindings ? [wails("./bindings")] : []),
  ],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: Number(process.env.WAILS_VITE_PORT) || 9245,
    strictPort: true,
  },
})
