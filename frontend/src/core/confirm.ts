import { create } from "zustand"

export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Styles the confirm button as destructive. */
  danger?: boolean
}

interface ConfirmState {
  request: (ConfirmOptions & { resolve: (answer: boolean) => void }) | null
}

export const useConfirmStore = create<ConfirmState>()(() => ({ request: null }))

/** Asks a yes/no question in a dialog. Resolves false when dismissed. */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    // A second question replaces the first, which counts as "no".
    useConfirmStore.getState().request?.resolve(false)
    useConfirmStore.setState({ request: { ...options, resolve } })
  })
}

export function answerConfirm(answer: boolean) {
  const { request } = useConfirmStore.getState()
  useConfirmStore.setState({ request: null })
  request?.resolve(answer)
}
