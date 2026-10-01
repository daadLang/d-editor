const SEPARATOR = /[\\/]/

export function basename(path: string) {
  return path.split(SEPARATOR).filter(Boolean).pop() ?? path
}

export function dirname(path: string) {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))
  return index > 0 ? path.slice(0, index) : path
}

/** Joins using the separator style already used by `dir` (Windows or POSIX). */
export function joinPath(dir: string, name: string) {
  const separator = dir.includes("\\") && !dir.includes("/") ? "\\" : "/"
  return dir.endsWith(separator) ? dir + name : dir + separator + name
}

/** True when `path` is `parent` itself or lives somewhere below it. */
export function isInside(path: string, parent: string) {
  return (
    path === parent ||
    path.startsWith(parent + "/") ||
    path.startsWith(parent + "\\")
  )
}
