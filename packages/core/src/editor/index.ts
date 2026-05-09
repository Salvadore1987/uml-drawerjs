/**
 * Vanilla bootstrap for `@uml-drawer/core`. `createEditor(host, options)`
 * is the one-call entry point that composes parser, generator, validators,
 * commands, history, renderer, and exporters into a single instance bound
 * to a host element. The React adapter (Phase 12) wraps this same surface.
 */
export { createEditor } from "./createEditor.js";
export type {
  CreateEditorOptions,
  EditorChangeEvent,
  EditorInstance,
  EditorTheme,
  LoadFromTextResult,
} from "./options.js";
