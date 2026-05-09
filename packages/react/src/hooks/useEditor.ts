import type { EditorInstance } from "@uml-drawer/core/editor";
import { useContext } from "react";
import { UmlEditorContext } from "../internal/context.js";

/**
 * Reach the underlying `EditorInstance`. Returns `null` during the
 * brief window between `<UmlEditor>` mount and `<Canvas>` registering
 * its host (the editor is constructed in an effect once a host exists).
 *
 * Components that have nothing to render until the editor is ready
 * usually short-circuit:
 *
 *   const editor = useEditor();
 *   if (!editor) return null;
 *
 * Throws — with a clear message — when used outside of `<UmlEditor>`.
 */
export function useEditor(): EditorInstance | null {
  const value = useContext(UmlEditorContext);
  if (value === null) {
    throw new Error(
      "useEditor() must be called inside <UmlEditor>. Did you forget to wrap your tree?",
    );
  }
  return value.editor;
}
