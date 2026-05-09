import type { SelectionModel } from "@uml-drawer/core/renderer";
import { createSelectionModel } from "@uml-drawer/core/renderer";
import { useContext, useEffect, useRef, useState } from "react";
import { UmlEditorContext } from "../internal/context.js";

export interface SelectionController {
  set(ids: Iterable<string>): void;
  clear(): void;
  add(id: string): void;
  remove(id: string): void;
  toggle(id: string): void;
}

/**
 * Selection store hook. Returns a snapshot `Set` plus a controller of
 * imperative methods. The model is owned by the `<UmlEditor>` provider
 * — multiple consumers share a single source of truth.
 *
 * When the hook is called outside of `<UmlEditor>` (or before it is
 * ready), it returns a no-op controller bound to a private,
 * never-shared model so consumers can render placeholders without
 * blowing up.
 */
export function useSelection(): readonly [ReadonlySet<string>, SelectionController] {
  const value = useContext(UmlEditorContext);
  const fallbackRef = useRef<SelectionModel | null>(null);
  if (!fallbackRef.current) fallbackRef.current = createSelectionModel();
  const selection = value?.selection ?? fallbackRef.current;

  const [snapshot, setSnapshot] = useState<ReadonlySet<string>>(() => new Set(selection.get()));

  useEffect(() => {
    setSnapshot(new Set(selection.get()));
    return selection.subscribe((next) => {
      setSnapshot(new Set(next));
    });
  }, [selection]);

  return [snapshot, controller(selection)];
}

function controller(selection: SelectionModel): SelectionController {
  return {
    set(ids: Iterable<string>): void {
      selection.set(ids);
    },
    clear(): void {
      selection.clear();
    },
    add(id: string): void {
      selection.add(id);
    },
    remove(id: string): void {
      selection.remove(id);
    },
    toggle(id: string): void {
      selection.toggle(id);
    },
  };
}
