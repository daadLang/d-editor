import { useThemeStore } from "@/lib/theme-store"

/** Logo variant that is readable on the current theme. */
export function useLogo() {
  const category = useThemeStore((state) => state.category)
  return `${import.meta.env.BASE_URL}${category === "light" ? "logo.png" : "logo-dark.png"}`
}
