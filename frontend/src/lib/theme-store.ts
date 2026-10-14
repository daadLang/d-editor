import { create } from "zustand"

import {
  THEMES,
  getTheme,
  type ThemeCategory,
  type ThemePalette,
} from "@/lib/themes"

const CACHE_KEY = "daad-ide:theme"

// ── colour helpers ──────────────────────────────────────────────────────────

function toRgb(hex: string): [number, number, number] {
  let value = hex.replace("#", "")
  if (value.length === 3) value = [...value].map((c) => c + c).join("")
  const n = Number.parseInt(value, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function luminance(hex: string) {
  const [r, g, b] = toRgb(hex).map((channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Picks black or white text, whichever is more readable on `background`. */
function readableOn(background: string) {
  const l = luminance(background)
  const againstWhite = 1.05 / (l + 0.05)
  const againstBlack = (l + 0.05) / 0.05
  return againstBlack >= againstWhite ? "#0a0a0a" : "#fafafa"
}

// ── palette → shadcn CSS variables ──────────────────────────────────────────

/**
 * Maps an IDE palette onto the standard shadcn design tokens, so every shadcn
 * component (and any component added later with the CLI) follows the theme.
 */
export function paletteToCssVars(
  p: ThemePalette,
  category: ThemeCategory
): Record<string, string> {
  const onAccent = readableOn(p.accent)
  const destructive = category === "dark" ? "#ef4444" : "#dc2626"

  return {
    "--background": p.bg,
    "--foreground": p.text,
    "--card": p.bg2,
    "--card-foreground": p.text,
    "--popover": p.bg2,
    "--popover-foreground": p.text,
    "--primary": p.accent,
    "--primary-foreground": onAccent,
    "--secondary": p.bg3,
    "--secondary-foreground": p.text,
    "--muted": p.bg3,
    "--muted-foreground": p.text2,
    "--accent": p.hover,
    "--accent-foreground": p.text,
    "--destructive": destructive,
    "--border": p.border,
    "--input": p.border,
    "--ring": p.accent,
    "--chart-1": p.accent,
    "--chart-2": p.accent2,
    "--chart-3": p.success,
    "--chart-4": p.text2,
    "--chart-5": p.text3,
    "--sidebar": p.bg2,
    "--sidebar-foreground": p.text,
    "--sidebar-primary": p.accent,
    "--sidebar-primary-foreground": onAccent,
    "--sidebar-accent": p.hover,
    "--sidebar-accent-foreground": p.text,
    "--sidebar-border": p.border,
    "--sidebar-ring": p.accent,
    "--success": p.success,
  }
}

// ── store ───────────────────────────────────────────────────────────────────

interface ThemeState {
  /** The theme in effect. */
  key: string
  category: ThemeCategory
  /** True while no theme was chosen, so the OS light/dark setting decides. */
  isDefault: boolean
}

/** The user's saved choice; "" means none, i.e. the default. */
function readCachedKey() {
  try {
    return localStorage.getItem(CACHE_KEY) ?? ""
  } catch {
    return ""
  }
}

const cachedKey = readCachedKey()
const initial = getTheme(cachedKey)

export const useThemeStore = create<ThemeState>()(() => ({
  key: initial.key,
  category: initial.category,
  isDefault: cachedKey === "",
}))

/**
 * Applies an IDE theme to the document and remembers the choice for the next
 * launch. Pass "" to go back to the default (Daad Light/Dark by OS setting).
 */
export function applyTheme(choice: string) {
  const theme = getTheme(choice)
  const root = document.documentElement

  for (const [name, value] of Object.entries(
    paletteToCssVars(theme.palette, theme.category)
  )) {
    root.style.setProperty(name, value)
  }
  root.classList.toggle("dark", theme.category === "dark")
  root.style.colorScheme = theme.category

  // Remember the *choice*, not the resolved theme, so the default keeps
  // following the OS setting.
  const isDefault = choice === "" || !THEMES.some((t) => t.key === choice)
  try {
    localStorage.setItem(CACHE_KEY, isDefault ? "" : theme.key)
  } catch {
    // Storage may be unavailable in some webviews; the theme still applies.
  }
  useThemeStore.setState({ key: theme.key, category: theme.category, isDefault })
}

// While no theme is chosen, follow the OS when it switches between light/dark.
try {
  window
    .matchMedia("(prefers-color-scheme: light)")
    .addEventListener("change", () => {
      if (useThemeStore.getState().isDefault) applyTheme("")
    })
} catch {
  // matchMedia is unavailable; the default is resolved once at startup.
}
