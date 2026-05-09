/**
 * Public option / event types for `createEditor` (Phase 10).
 *
 * The vanilla bootstrap is the lowest-level supported entry point — the
 * React adapter (Phase 12) wraps these same primitives. Nothing here
 * touches the DOM directly; the implementation in `createEditor.ts` does.
 */
import type { Command } from "../commands/index.js";
import type { CommandBus } from "../commands/index.js";
import type { ExportJsonOptions, ExportPngOptions, ExportSvgOptions } from "../exporters/index.js";
import type { ImportJsonResult, ImportPumlResult } from "../exporters/index.js";
import type { History, HistoryOptions } from "../history/index.js";
import type { LayoutOptions } from "../layout/index.js";
import type { Diagram, DiagramError, DiagramType } from "../model/types.js";
import type {
  KeyboardNavigationOptions,
  PanZoomController,
  PanZoomOptions,
  RendererOptions,
  SelectionModel,
} from "../renderer/index.js";

/** Three-state theme selector. `"auto"` follows `prefers-color-scheme`. */
export type EditorTheme = "light" | "dark" | "auto";

/** Payload delivered to `onChange` after every command dispatch. */
export interface EditorChangeEvent {
  /** Newly-generated PlantUML text. */
  readonly text: string;
  /** Current AST snapshot. Immutable from the consumer's perspective. */
  readonly ast: Diagram;
  /** All diagnostics from the validator stack (parser → semantic → constraints → lint). */
  readonly errors: readonly DiagramError[];
  /** The command that triggered the change, or `null` for the initial publish. */
  readonly command: Command | null;
}

/** Options accepted by `createEditor`. */
export interface CreateEditorOptions {
  /** Diagram type — fixed for the editor's lifetime, per spec. */
  readonly diagramType: DiagramType;
  /** Optional initial PlantUML text. Mutually exclusive with `initialDiagram`. */
  readonly initialText?: string;
  /** Optional initial AST. Used as-is when `initialText` is not provided. */
  readonly initialDiagram?: Diagram;
  /** Theme applied to the host on mount. Defaults to `"auto"`. */
  readonly theme?: EditorTheme;
  /** Forwarded to `renderDiagram`. */
  readonly rendererOptions?: RendererOptions;
  /** Forwarded to `runAutoLayout` (used by import + manual layout). */
  readonly layoutOptions?: LayoutOptions;
  /** Forwarded to the `History` constructor. */
  readonly historyOptions?: HistoryOptions;
  /** Override id allocation — production uses uuidv7; tests use sequential ids. */
  readonly idFactory?: () => string;
  /** Disable interactions for headless / read-only contexts. */
  readonly interactive?: {
    readonly panZoom?: boolean | PanZoomOptions;
    readonly keyboard?: boolean | KeyboardNavigationOptions;
    /**
     * Selection model the editor should consult when resolving
     * keyboard / pointer interactions (Delete removes the selected node,
     * Arrow nudges it). When omitted, an internal selection model is
     * created so interactions still work in vanilla bootstraps.
     */
    readonly selection?: SelectionModel;
    /**
     * Pointer interactions on the canvas (click-to-select, drag-to-move,
     * drag-to-connect, double-click rename). Defaults to the same
     * resolution as `panZoom` — enabled when interactivity is enabled.
     */
    readonly pointer?: boolean;
    /**
     * Snap-to-grid for move and resize gestures. Holding `Alt` during a
     * gesture temporarily disables snap regardless of `enabled`. Step
     * defaults to 24 px (matches `--uml-canvas-grid-density`).
     */
    readonly snap?: { readonly enabled?: boolean; readonly step?: number };
    /**
     * Initial grid visibility. Toggle via `editor.toggleGrid()`,
     * `editor.setGridVisible(b)`, or the Cmd+Shift+G shortcut. Defaults
     * to `true`.
     */
    readonly grid?: { readonly visible?: boolean };
  };
  /** Fires after every command (including undo / redo / import). */
  readonly onChange?: (event: EditorChangeEvent) => void;
  /** Fires whenever the validator stack produces a fresh result. */
  readonly onValidate?: (errors: readonly DiagramError[]) => void;
}

/**
 * Public surface of an editor instance. Methods are deliberately small —
 * anything more advanced (custom commands, raw bus access) is reachable via
 * `bus` / `history` for power users without bloating the dictionary.
 */
export interface EditorInstance {
  /** Replace the current AST with the result of parsing `text`. */
  loadFromText(text: string): Promise<EditorChangeEvent>;
  /** Replace the current AST with the result of `importJson(text)`. */
  loadFromJson(text: string): ImportJsonResult;
  /** Round-trip the current AST through the generator. */
  exportText(): string;
  /** Serialise the current diagram to a standalone SVG string. */
  exportSvg(options?: ExportSvgOptions): string;
  /** Rasterise the current diagram into a PNG `Blob`. */
  exportPng(options?: ExportPngOptions): Promise<Blob>;
  /** Serialise the current AST to `.umljson`. */
  exportJson(options?: ExportJsonOptions): string;
  /** Undo the most recent command frame. Returns `true` if anything happened. */
  undo(): boolean;
  /** Redo the most recently-undone frame. Returns `true` if anything happened. */
  redo(): boolean;
  /** Run auto-layout and persist the coordinates via `ApplyLayoutCommand`. */
  runAutoLayout(options?: LayoutOptions): Promise<void>;
  /** Switch theme on the host element. Triggers the contract's transition. */
  applyTheme(theme: EditorTheme): void;
  /** Multiplicative zoom around the viewport centre. */
  zoomIn(factor?: number): void;
  zoomOut(factor?: number): void;
  /** Reset pan/zoom to identity (1:1, no translation). */
  zoomReset(): void;
  /** Frame the diagram so it fits the viewport. */
  fitToView(padding?: number): void;
  /**
   * Centre the diagram in the viewport at 100% (scale=1). Different from
   * `fitToView`, which scales to fit; `centerView` keeps pixel-faithful
   * coordinates so resize/snap remain predictable.
   */
  centerView(): void;
  /** Toggle canvas-side editing. Pan/zoom remain active when locked. */
  setLocked(flag: boolean): void;
  isLocked(): boolean;
  /** Show/hide the SVG grid layer. Snap remains active even when hidden. */
  setGridVisible(flag: boolean): void;
  toggleGrid(): boolean;
  isGridVisible(): boolean;
  /** Subscribe to grid-visibility changes. Returns an unsubscribe fn. */
  onGridChange(listener: (visible: boolean) => void): () => void;
  /** Dispatch a command and return the resulting AST. */
  dispatch(command: Command): Diagram;
  /** Current AST snapshot. */
  getState(): Diagram;
  /** Latest validator output. */
  getErrors(): readonly DiagramError[];
  /** Underlying command bus — exposed so power users can subscribe to events. */
  readonly bus: CommandBus;
  /** Underlying history stack — exposed for menu-bar enable/disable. */
  readonly history: History;
  /** Pan/zoom controller, or `null` if interactivity was disabled. */
  readonly panZoom: PanZoomController | null;
  /** Selection model — exposed so React / DOM adapters can subscribe. */
  readonly selection: SelectionModel;
  /** Detach all listeners and remove the rendered SVG from the host. */
  destroy(): void;
}

/** Result of `loadFromText` — same shape as `importPuml` plus the `EditorChangeEvent`. */
export interface LoadFromTextResult extends ImportPumlResult {
  readonly change: EditorChangeEvent;
}
