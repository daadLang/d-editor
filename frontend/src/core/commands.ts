import type { ComponentType } from "react"
import { create } from "zustand"

import { toDisposable, type Disposable } from "@/core/disposable"
import {
  matchesKeybinding,
  parseKeybinding,
  type Keybinding,
} from "@/core/keybindings"

export interface CommandOptions {
  /** Shown in the command palette. Commands without a title are not listed. */
  title?: string
  icon?: ComponentType
  /** E.g. `Mod+Shift+KeyF`; see `keybindings.ts`. */
  keybinding?: string
  /** Hides the command from the palette while it returns false. */
  when?: () => boolean
}

/**
 * A command handler. Returning exactly `false` means "nothing to do here":
 * the key press that triggered it is then left to the browser.
 */
export type CommandHandler = (...args: unknown[]) => unknown

export interface CommandDef extends CommandOptions {
  id: string
  run: CommandHandler
  binding: Keybinding | null
}

interface CommandState {
  commands: CommandDef[]
}

export const useCommandStore = create<CommandState>()(() => ({ commands: [] }))

export function registerCommand(
  id: string,
  run: CommandHandler,
  options: CommandOptions = {}
): Disposable {
  const def: CommandDef = {
    id,
    run,
    ...options,
    binding: options.keybinding ? parseKeybinding(options.keybinding) : null,
  }
  useCommandStore.setState((state) => ({
    commands: [...state.commands.filter((command) => command.id !== id), def],
  }))
  return toDisposable(() =>
    useCommandStore.setState((state) => ({
      // Only remove our own registration, not a newer one with the same id.
      commands: state.commands.filter((command) => command !== def),
    }))
  )
}

export async function executeCommand(id: string, ...args: unknown[]): Promise<unknown> {
  const command = useCommandStore.getState().commands.find((item) => item.id === id)
  if (!command) throw new Error(`Unknown command: ${id}`)
  return command.run(...args)
}

/** Runs the command bound to a key press. Returns whether it was handled. */
export function runKeybinding(event: KeyboardEvent): boolean {
  const command = useCommandStore
    .getState()
    .commands.find((item) => item.binding && matchesKeybinding(item.binding, event))
  if (!command) return false
  const result = command.run()
  if (result === false) return false
  event.preventDefault()
  if (result instanceof Promise) {
    result.catch((error) => console.error(`[command ${command.id}]`, error))
  }
  return true
}
