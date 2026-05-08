/**
 * Headless selection model. Holds a set of "selected ids" (nodes / edges
 * / groups — the model doesn't care which) and notifies listeners on
 * change. The renderer subscribes to repaint with selection-aware
 * styling; the React adapter (Phase 12) subscribes to drive the props
 * panel; tests subscribe to inspect transitions.
 */
export type SelectionListener = (next: ReadonlySet<string>) => void;

export interface SelectionModel {
  get(): ReadonlySet<string>;
  has(id: string): boolean;
  set(ids: Iterable<string>): void;
  clear(): void;
  add(id: string): void;
  remove(id: string): void;
  toggle(id: string): void;
  subscribe(listener: SelectionListener): () => void;
}

export function createSelectionModel(initial: Iterable<string> = []): SelectionModel {
  let current: Set<string> = new Set(initial);
  const listeners = new Set<SelectionListener>();

  const emit = (): void => {
    const snapshot: ReadonlySet<string> = new Set(current);
    for (const listener of [...listeners]) listener(snapshot);
  };

  return {
    get(): ReadonlySet<string> {
      return current;
    },
    has(id: string): boolean {
      return current.has(id);
    },
    set(ids: Iterable<string>): void {
      current = new Set(ids);
      emit();
    },
    clear(): void {
      if (current.size === 0) return;
      current = new Set();
      emit();
    },
    add(id: string): void {
      if (current.has(id)) return;
      current = new Set([...current, id]);
      emit();
    },
    remove(id: string): void {
      if (!current.has(id)) return;
      const next = new Set(current);
      next.delete(id);
      current = next;
      emit();
    },
    toggle(id: string): void {
      if (current.has(id)) {
        const next = new Set(current);
        next.delete(id);
        current = next;
      } else {
        current = new Set([...current, id]);
      }
      emit();
    },
    subscribe(listener: SelectionListener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
