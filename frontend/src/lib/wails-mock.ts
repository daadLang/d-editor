import type {
  Backend,
  DaadOutputEvent,
  EventsApi,
  InterpreterOption,
  InterpreterStatus,
} from "@/lib/wails"

/** In-memory stand-in for the Go backend, used only when Wails is absent. */
export function createMockBackend() {
  const listeners = new Set<(event: DaadOutputEvent) => void>()
  const emit = (event: DaadOutputEvent) => listeners.forEach((l) => l(event))

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

  const backend: Backend = {
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
    EventsOn(_event, callback) {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
  }

  return { backend, events: eventsApi }
}
