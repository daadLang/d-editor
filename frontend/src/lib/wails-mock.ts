import type {
  Backend,
  EventsApi,
  ExtensionsState,
  FileEdits,
  InstalledExtension,
  InterpreterOption,
  InterpreterStatus,
  RegistryEntry,
  SearchFileResult,
  SearchMatch,
  SearchOptions,
} from "@/lib/wails"

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Extensions in the preview registry. Their files live in frontend/dev-extensions. */
const MOCK_REGISTRY: RegistryEntry[] = [
  {
    id: "hello",
    name: "مرحبًا (تجريبية)",
    version: "1.0.0",
    description: "إضافة تجريبية تضيف لوحة في الشريط الجانبي وأمرًا في لوحة الأوامر.",
    authors: ["daadLang"],
    repository: "https://github.com/daadLang/extensions",
    permissions: ["workspace.read"],
    api: 1,
    download: { url: "hello-1.0.0.tar.gz", sha256: "0".repeat(64) },
  },
  {
    id: "hello-command",
    name: "أمر تجريبي",
    version: "1.2.0",
    description: "إضافة تسجّل أمرًا واحدًا فقط، لتجربة التحديث والتعطيل.",
    authors: ["daadLang"],
    api: 1,
    download: { url: "hello-command-1.2.0.tar.gz", sha256: "0".repeat(64) },
  },
]

/** In-memory stand-in for the Go backend, used only when Wails is absent. */
export function createMockBackend() {
  const listeners = new Map<string, Set<(data: never) => void>>()
  const emitEvent = (name: string, data: unknown) =>
    listeners.get(name)?.forEach((listener) => listener(data as never))
  const emit = (event: { type: "stdout" | "stderr"; data: string }) =>
    emitEvent("daad-output", event)

  const root = "/demo"
  const files = new Map<string, string | null>([
    [root, null],
    [`${root}/رئيسي.ض`, "دالة جمع(أ, ب) -> عدد:\n    ارجع أ + ب\n\nنتيجة = جمع(5, 10)\n\nاطبع(نتيجة)\n"],
    [`${root}/مثال.daad`, "# مرحباً بالعالم\nاطبع(\"مرحباً بالعالم\")\n"],
    [`${root}/أمثلة`, null],
    [`${root}/أمثلة/حلقة.daad`, "كرر 3 مرات:\n    اطبع(\"تكرار\")\n"],
  ])
  let settings: Record<string, string> = {
    projectPath: "/home/demo/Documents",
    theme: "",
    themeCategory: "dark",
    interpreterPath: "",
  }
  let running = false

  // Starts with nothing selected and nothing on PATH, so the browser preview
  // exercises the "no interpreter" call to action.
  const interpreters: InterpreterOption[] = [
    {
      id: "installed:/home/demo/.daad-ide/interpreters/v0.1.0/daad",
      label: "daad v0.1.0",
      path: "/home/demo/.daad-ide/interpreters/v0.1.0/daad",
      version: "v0.1.0",
      source: "downloaded",
      releaseTag: "v0.1.0",
      releaseUrl: "https://github.com/daadLang/daad/releases/tag/v0.1.0",
      installed: true,
      selected: false,
      latest: false,
    },
    {
      id: "release:v0.2.0",
      label: "daad v0.2.0",
      path: "",
      version: "v0.2.0",
      source: "release",
      releaseTag: "v0.2.0",
      releaseUrl: "https://github.com/daadLang/daad/releases/tag/v0.2.0",
      installed: false,
      selected: false,
      latest: true,
    },
  ]
  const versionOf = (path: string) =>
    interpreters.find((o) => o.path === path)?.version ?? ""

  const childrenOf = (dir: string) =>
    [...files.keys()].filter(
      (p) => p.startsWith(dir + "/") && !p.slice(dir.length + 1).includes("/")
    )

  // --- find in files (same rules as internal/search, minus the gitignore) ---
  const cancelled = new Set<string>()
  const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

  function findInLine(line: string, options: SearchOptions): SearchMatch[] {
    let source = options.regex ? options.query : escapeRe(options.query)
    if (options.wholeWord) source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`
    const re = new RegExp(source, `gu${options.caseSensitive ? "" : "i"}`)
    const found: SearchMatch[] = []
    for (const m of line.matchAll(re)) {
      if (!m[0]) continue
      const lead = line.length - line.trimStart().length
      const start = Math.max(m.index - lead, 0)
      found.push({
        line: 0,
        column: m.index + 1,
        length: m[0].length,
        preview: line.trimStart(),
        previewStart: start,
      })
    }
    return found
  }

  async function runSearch(options: SearchOptions) {
    const started = Date.now()
    let fileCount = 0
    let matchCount = 0
    await wait(60)
    for (const [path, content] of files) {
      if (cancelled.has(options.id)) break
      if (typeof content !== "string" || !path.startsWith(options.root + "/")) continue
      const text = options.unsaved?.[path] ?? content
      const matches: SearchMatch[] = []
      text.split("\n").forEach((line, index) => {
        for (const match of findInLine(line, options)) matches.push({ ...match, line: index + 1 })
      })
      if (matches.length === 0) continue
      fileCount++
      matchCount += matches.length
      const result: SearchFileResult = { path, matches }
      emitEvent("search-event", { id: options.id, files: [result], done: false })
      await wait(40) // let the UI show results arriving in batches
    }
    emitEvent("search-event", {
      id: options.id,
      done: true,
      summary: {
        files: fileCount,
        matches: matchCount,
        truncated: false,
        cancelled: cancelled.has(options.id),
        durationMs: Date.now() - started,
      },
    })
    cancelled.delete(options.id)
  }

  // --- extensions ---
  const installed: InstalledExtension[] = []
  const extState: ExtensionsState = {
    disabled: [],
    dev: {},
    registryUrl: "https://daadlang.github.io/extensions/index.json",
  }

  const backend: Backend = {
    async StartSearch(options) {
      try {
        new RegExp(options.regex ? options.query : "x")
      } catch (error) {
        throw `invalid regular expression: ${String(error)}`
      }
      void runSearch(options)
      return options.id
    },
    async CancelSearch(id) {
      cancelled.add(id)
    },
    async ReplaceInFiles(options, replacement, targets) {
      const expand = (m: RegExpMatchArray) =>
        options.regex
          ? replacement.replace(/\$(\$|\d+)/g, (_, g: string) => (g === "$" ? "$" : (m[Number(g)] ?? "")))
          : replacement
      const out: FileEdits[] = []
      for (const target of targets) {
        const original = options.unsaved?.[target.path] ?? files.get(target.path)
        const result: FileEdits = { path: target.path, edits: [], written: false, skipped: 0 }
        out.push(result)
        if (typeof original !== "string" || !target.path.startsWith(options.root + "/")) {
          result.error = "cannot read the file as text"
          continue
        }
        const lines = original.split("\n")
        for (const p of target.matches) {
          const line = lines[p.line - 1]?.replace(/\r$/, "")
          let source = options.regex ? options.query : escapeRe(options.query)
          if (options.wholeWord) source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`
          const hit = [...(line ?? "").matchAll(new RegExp(source, `gu${options.caseSensitive ? "" : "i"}`))].find(
            (m) => m[0] && m.index + 1 === p.column && m[0].length === p.length
          )
          if (!hit) result.skipped++
          else if (!result.edits.some((e) => e.line === p.line && e.column === p.column))
            result.edits.push({ ...p, text: expand(hit) })
        }
        if (options.unsaved?.[target.path] !== undefined || result.edits.length === 0) continue
        for (const e of [...result.edits].sort((a, b) => b.line - a.line || b.column - a.column)) {
          const line = lines[e.line - 1]
          lines[e.line - 1] = line.slice(0, e.column - 1) + e.text + line.slice(e.column - 1 + e.length)
        }
        files.set(target.path, lines.join("\n"))
        result.written = true
      }
      return out
    },
    async ListInstalledExtensions() {
      return installed.map((item) => ({ ...item, enabled: !extState.disabled.includes(item.id) }))
    },
    async GetExtensionsState() {
      return structuredClone(extState)
    },
    async SetExtensionEnabled(id, enabled) {
      extState.disabled = extState.disabled.filter((item) => item !== id)
      if (!enabled) extState.disabled.push(id)
    },
    async SetRegistryURL(url) {
      extState.registryUrl = url || "https://daadlang.github.io/extensions/index.json"
    },
    async FetchExtensionIndex() {
      await wait(500)
      return { schema: 1, extensions: MOCK_REGISTRY }
    },
    async InstallExtension(id) {
      const entry = MOCK_REGISTRY.find((item) => item.id === id)
      if (!entry) throw `extension "${id}" is not in the registry`
      await wait(800)
      const item: InstalledExtension = {
        id: entry.id,
        name: entry.name,
        version: entry.version,
        description: entry.description,
        authors: entry.authors,
        repository: entry.repository,
        permissions: entry.permissions,
        main: "index.js",
        api: entry.api,
        enabled: true,
        source: "installed",
      }
      const at = installed.findIndex((existing) => existing.id === id)
      if (at >= 0) installed[at] = item
      else installed.push(item)
      return item
    },
    async UninstallExtension(id) {
      const at = installed.findIndex((item) => item.id === id)
      if (at < 0) throw `extension "${id}" is not installed`
      installed.splice(at, 1)
    },
    async LinkDevExtension() {
      return { id: "" } as InstalledExtension // the folder dialog is "cancelled"
    },

    async ReadDirectory(dir) {
      return childrenOf(dir).map((path) => ({
        name: path.split("/").pop()!,
        path,
        isDirectory: files.get(path) === null,
      }))
    },
    async ReadFile(path) {
      const content = files.get(path)
      if (typeof content !== "string") throw "failed to read file"
      return content
    },
    async WriteFile(path, content) {
      files.set(path, content)
    },
    async CreateFile(path) {
      if (files.has(path)) throw "failed to create file: file exists"
      files.set(path, "")
    },
    async CreateDirectory(path) {
      if (files.has(path)) throw "failed to create folder: file exists"
      files.set(path, null)
    },
    async DeletePath(target) {
      for (const p of [...files.keys()])
        if (p === target || p.startsWith(target + "/")) files.delete(p)
    },
    async RenamePath(from, to) {
      for (const [p, v] of [...files]) {
        if (p === from || p.startsWith(from + "/")) {
          files.delete(p)
          files.set(to + p.slice(from.length), v)
        }
      }
    },
    async OpenFolderDialog() {
      return root
    },
    async SelectProjectPath() {
      return "/home/demo/Projects"
    },
    async CreateProjectFolder(name) {
      const dir = `/home/demo/Documents/${name}`
      files.set(dir, null)
      files.set(`${dir}/رئيسي.ض`, "اطبع(\"مرحباً\")\n")
      return dir
    },
    async ReadSettings() {
      return settings
    },
    async WriteSettings(next) {
      settings = next
    },
    async ListInterpreters(configured) {
      return interpreters.map((o) => ({ ...o, selected: o.path === configured }))
    },
    async GetInterpreterStatus(configured): Promise<InterpreterStatus> {
      if (!configured) {
        return { found: false, path: "", version: "", label: "", source: "", reason: "not-installed" }
      }
      const version = versionOf(configured)
      return {
        found: true,
        path: configured,
        version,
        label: version ? `daad ${version}` : "daad",
        source: configured.includes(".daad-ide") ? "downloaded" : "custom",
        reason: "",
      }
    },
    async SelectInterpreter() {
      return "/opt/daad/bin/daad"
    },
    async InstallInterpreter() {
      await new Promise((r) => setTimeout(r, 1200))
      interpreters[1] = {
        ...interpreters[1],
        installed: true,
        source: "downloaded",
        id: "installed:/home/demo/.daad-ide/interpreters/v0.2.0/daad",
        path: "/home/demo/.daad-ide/interpreters/v0.2.0/daad",
      }
      return interpreters[1].path
    },
    async OpenExternalURL(url) {
      window.open(url, "_blank")
    },
    async RunDaad(filePath) {
      running = true
      emit({ type: "stdout", data: `تشغيل ${filePath}\n` })
      await new Promise((r) => setTimeout(r, 400))
      emit({ type: "stdout", data: "15\n" })
      await new Promise((r) => setTimeout(r, 300))
      emit({ type: "stderr", data: "تحذير: هذه بيئة معاينة بلا مفسر حقيقي\n" })
      running = false
      return { code: 0, stdout: "", stderr: "" }
    },
    async WriteDaadStdin(data) {
      if (running) emit({ type: "stdout", data })
      return running
    },
    async EndDaadStdin() {
      return running
    },
  }

  const eventsApi: EventsApi = {
    EventsOn(event, callback) {
      const set = listeners.get(event) ?? new Set()
      set.add(callback as (data: never) => void)
      listeners.set(event, set)
      return () => {
        set.delete(callback as (data: never) => void)
      }
    },
  }

  return { backend, events: eventsApi }
}
