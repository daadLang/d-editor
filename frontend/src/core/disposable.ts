/** Something that can be released. Every registration in the core returns one. */
export interface Disposable {
  dispose(): void
}

export const toDisposable = (fn: () => void): Disposable => {
  let done = false
  return {
    dispose() {
      if (done) return
      done = true
      fn()
    },
  }
}

/** Collects disposables so an extension can release everything it registered at once. */
export class DisposableStore implements Disposable {
  private items: Disposable[] = []

  add<T extends Disposable>(item: T): T {
    this.items.push(item)
    return item
  }

  dispose() {
    const items = this.items
    this.items = []
    for (const item of items.reverse()) {
      try {
        item.dispose()
      } catch (error) {
        console.error("[core] dispose failed", error)
      }
    }
  }
}

/** A value that can be read now and watched later (works outside React). */
export interface Observable<T> {
  get(): T
  subscribe(listener: (value: T) => void): Disposable
}
