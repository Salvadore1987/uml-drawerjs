import type { DiagramError } from "@uml-drawer/core/model";
import { useEditorState } from "./useEditorState.js";

/**
 * Read-only access to the editor's latest validator output. Wrapper
 * around `useEditorState` that pulls just the `errors` slice — saves
 * memoisation boilerplate in the props panel and the problems list.
 */
export function useDiagramErrors(): readonly DiagramError[] {
  const { errors } = useEditorState();
  return errors;
}
