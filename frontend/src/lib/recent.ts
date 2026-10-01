const KEY = "recentProjects"
const LIMIT = 5

export function getRecentProjects(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]")
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : []
  } catch {
    return []
  }
}

export function addRecentProject(path: string): string[] {
  const next = [path, ...getRecentProjects().filter((p) => p !== path)].slice(
    0,
    LIMIT
  )
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Local storage can be disabled by the host environment.
  }
  return next
}
