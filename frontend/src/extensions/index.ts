import { registerBuiltinCommands } from "@/core/builtin-commands"
import { activateExtension, type ExtensionModule } from "@/core/extension-host"
import * as explorer from "@/extensions/explorer"

/**
 * Extensions that ship with the IDE and are active by default. While the
 * extension API settles they live in this repository; each is meant to move to
 * its own repository (see docs/extensions-architecture.md).
 */
const BUILTIN: ExtensionModule[] = [
  { manifest: explorer.manifest, ...explorer.extension },
]

let started = false

export async function startExtensions() {
  if (started) return
  started = true
  registerBuiltinCommands()
  await Promise.all(BUILTIN.map(activateExtension))
}
