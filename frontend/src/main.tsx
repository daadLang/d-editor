import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "@fontsource/ibm-plex-sans-arabic/arabic-400.css"
import "@fontsource/ibm-plex-sans-arabic/arabic-500.css"
import "@fontsource/ibm-plex-sans-arabic/arabic-600.css"
import "@fontsource/ibm-plex-sans-arabic/latin-400.css"
import "@fontsource/ibm-plex-sans-arabic/latin-500.css"
import "@fontsource/ibm-plex-sans-arabic/latin-600.css"
import "@fontsource/ibm-plex-mono/latin-400.css"
import "@fontsource/ibm-plex-mono/latin-500.css"
import "./index.css"

import App from "@/App"
import { applyTheme, useThemeStore } from "@/lib/theme-store"

// Apply the remembered theme before the first paint to avoid a flash.
applyTheme(useThemeStore.getState().key)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
