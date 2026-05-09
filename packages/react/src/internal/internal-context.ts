import { createContext } from "react";

/**
 * Internal context — separated from the public `UmlEditorContext` because
 * its value (the `registerCanvas` callback in particular) is meaningful
 * only to the adapter's own components and would leak implementation
 * details if exposed via a public hook.
 */
export interface UmlEditorInternalContextValue {
  registerCanvas: (node: HTMLDivElement | null) => void;
}

export const UmlEditorInternalContext = createContext<UmlEditorInternalContextValue | null>(null);

UmlEditorInternalContext.displayName = "UmlEditorInternalContext";
