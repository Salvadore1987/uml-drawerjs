/**
 * `@uml-drawer/react` — idiomatic React adapter for `@uml-drawer/core`.
 *
 * Components ship without brand aesthetics — every visual decision
 * resolves through the `--uml-*` theming contract from
 * `@uml-drawer/theme`. Skins live in downstream applications (e.g. the
 * playground's cyber-topographic skin), never in this package.
 *
 *   import { UmlEditor, Canvas, Palette, PropsPanel } from "@uml-drawer/react";
 *   import "@uml-drawer/react/styles.css";
 */

// Side-effect import so bundlers pick up the stylesheet for the
// `@uml-drawer/react/styles.css` subpath even when consumers forget
// the explicit import. Tagged in `package.json` `sideEffects`.
import "./styles.css";

export { UmlEditor } from "./components/UmlEditor.js";
export type { UmlEditorProps, UmlEditorLayout } from "./components/UmlEditor.js";

export { Canvas } from "./components/Canvas.js";
export type { CanvasProps } from "./components/Canvas.js";

export { Palette, DEFAULT_PALETTE_ITEMS } from "./components/Palette.js";
export type { PaletteProps, PaletteItem, PaletteFilter } from "./components/Palette.js";

export { PropsPanel } from "./components/PropsPanel.js";
export type { PropsPanelProps } from "./components/PropsPanel.js";

export { TextEditor } from "./components/TextEditor.js";
export type { TextEditorProps } from "./components/TextEditor.js";

export { Outline } from "./components/Outline.js";
export type { OutlineProps } from "./components/Outline.js";

export { HUD } from "./components/HUD.js";
export type { HUDProps, HUDSlots } from "./components/HUD.js";

export { CommandChannel } from "./components/CommandChannel.js";
export type {
  CommandChannelProps,
  CommandHandler,
  CommandResult,
} from "./components/CommandChannel.js";

export { Statusbar } from "./components/Statusbar.js";
export type { StatusbarProps } from "./components/Statusbar.js";

export { Tabs } from "./components/Tabs.js";
export type { TabsProps, TabDescriptor } from "./components/Tabs.js";

export { useEditor } from "./hooks/useEditor.js";
export { useEditorState } from "./hooks/useEditorState.js";
export { useDiagramErrors } from "./hooks/useDiagramErrors.js";
export { useSelection } from "./hooks/useSelection.js";
export type { SelectionController } from "./hooks/useSelection.js";
