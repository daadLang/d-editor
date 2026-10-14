import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
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

// Wails serves the built frontend from dist/renderer (see main.go → go:embed).
// `wails3 dev` starts this server on WAILS_VITE_PORT and points the desktop
// window at it; a plain `yarn dev:frontend` keeps using 5173.
export default defineConfig({
  root: "frontend",
  base: "./",
  publicDir: "assets",
  plugins: [react(), tailwindcss(), contentSecurityPolicy],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "frontend/src"),
    },
  },
  build: {
    outDir: "../dist/renderer",
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: Number(process.env.WAILS_VITE_PORT) || 5173,
    strictPort: true,
  },
})
