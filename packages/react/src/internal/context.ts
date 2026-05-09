import type { EditorInstance } from "@uml-drawer/core/editor";
import type { SelectionModel } from "@uml-drawer/core/renderer";
import { createContext } from "react";
import type { PaletteFilter } from "../components/Palette.js";
import type { UmlEditorLayout } from "../components/UmlEditor.js";

/**
 * Internal context shared between `<UmlEditor>` and every sub-component
 * that needs access to the underlying core editor. Consumers reach the
 * value through the public hooks (`useEditor`, `useEditorState`, …) — the
 * raw context is intentionally not exported so we can change the shape
 * without breaking downstream apps.
 *
 * `editor` is nullable to cover the brief moment between `<UmlEditor>`
 * mount and `<Canvas>` registering its host. The provider value itself
 * is always non-null whenever an `<UmlEditor>` is in the tree, which
 * lets `useEditor()` reliably distinguish "no provider" (throw) from
 * "still booting" (return null).
 */
export interface UmlEditorContextValue {
  /** The wired `createEditor` instance, or `null` while booting. */
  readonly editor: EditorInstance | null;
  /** Selection model — owned by the React adapter, not the core editor. */
  readonly selection: SelectionModel;
  /** Optional palette filter, passed through to `<Palette>`. */
  readonly paletteFilter: PaletteFilter | null;
  /** Resolved layout slots. */
  readonly layout: Required<UmlEditorLayout>;
}

export const UmlEditorContext = createContext<UmlEditorContextValue | null>(null);

UmlEditorContext.displayName = "UmlEditorContext";
