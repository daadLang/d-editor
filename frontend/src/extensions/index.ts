import { registerBuiltinCommands } from "@/core/builtin-commands"
import { startManager, type BuiltinExtension } from "@/core/extension-manager"
import * as explorer from "@/extensions/explorer"
import * as extensionStore from "@/extensions/extension-store"
import * as search from "@/extensions/search"

/**
 * Extensions that ship with the IDE and are active by default. While the
 * extension API settles they live in this repository; each is meant to move to
 * its own repository (see docs/extensions-architecture.md).
 */
const BUILTIN: BuiltinExtension[] = [
  { manifest: explorer.manifest, ...explorer.extension },
  { manifest: search.manifest, ...search.extension },
  // Without the store nothing disabled could be turned back on.
  { manifest: extensionStore.manifest, ...extensionStore.extension, locked: true },
]

let started = false

export async function startExtensions() {
  if (started) return
  started = true
  registerBuiltinCommands()
  await startManager(BUILTIN)
}
