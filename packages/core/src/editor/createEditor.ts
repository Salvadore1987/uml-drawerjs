import {
  applyLayoutCommand,
  importTextCommand,
  moveNodeCommand,
  removeGroupCommand,
  removeNodeCommand,
} from "../commands/index.js";
import { CommandBus } from "../commands/index.js";
import type { Command } from "../commands/index.js";
import { exportJson, exportPng, exportSvg, importJson, importPuml } from "../exporters/index.js";
import type {
  ExportJsonOptions,
  ExportPngOptions,
  ExportSvgOptions,
  ImportJsonResult,
} from "../exporters/index.js";
import { generatePlantUml } from "../generator/index.js";
import { History } from "../history/index.js";
import { runAutoLayout } from "../layout/index.js";
import type { LayoutOptions } from "../layout/index.js";
import { createEmptyDiagram } from "../model/factory.js";
import { cloneDiagram } from "../model/clone.js";
import type { Diagram, DiagramError } from "../model/types.js";
import { adoptParserErrors, runAllValidators } from "../validators/index.js";
import {
  attachInteractions,
  attachKeyboardNavigation,
  createPanZoomController,
  createSelectionModel,
  mountSvg,
  rerenderSvg,
  renderDiagram,
} from "../renderer/index.js";
import type {
  InteractionsController,
  KeyboardNavigationController,
  KeyboardNavigationOptions,
  MountResult,
  PanZoomController,
  PanZoomOptions,
  SelectionModel,
  SnapOptions,
} from "../renderer/index.js";
import { DEFAULT_SNAP } from "../renderer/index.js";
import type {
  CreateEditorOptions,
  EditorChangeEvent,
  EditorInstance,
  EditorTheme,
} from "./options.js";

/**
 * Vanilla bootstrap that composes the inner-hexagon modules into a single
 * editor instance attached to `host`. The implementation deliberately wires
 * up only what the spec asks for in Phase 10 — commands, history, the SVG
 * renderer, the export surface, and the theming contract. Anything more
 * opinionated (palette, props panel, command channel) belongs to the React
 * adapter (Phase 12) or the playground (Phase 13).
 *
 *   const editor = createEditor(host, { diagramType: "class" });
 *   editor.loadFromText(text);
 *   editor.exportSvg();
 *   editor.destroy();
 */
const HOST_DATA_FLAG = "data-uml-host";
const HOST_THEME_ATTR = "data-theme";

export function createEditor(host: Element, options: CreateEditorOptions): EditorInstance {
  ensureHostMarkup(host);

  const initialDiagram = resolveInitialDiagram(options);
  const bus = new CommandBus(initialDiagram);
  const history = new History(bus, options.historyOptions);

  // Theme handling — tracks `prefers-color-scheme` only while in `"auto"`.
  let activeTheme: EditorTheme = options.theme ?? "auto";
  const themeMql = matchPrefersColorScheme();
  const themeMqlListener = (): void => {
    if (activeTheme === "auto") writeThemeAttribute(host, "auto", themeMql);
  };
  themeMql?.addEventListener("change", themeMqlListener);
  writeThemeAttribute(host, activeTheme, themeMql);

  // Optional interactivity — every controller is disposed in `destroy()`.
  const interactive = options.interactive ?? {};
  const selection: SelectionModel = interactive.selection ?? createSelectionModel();
  let locked = false;
  const getLocked = (): boolean => locked;

  // Snap config — interactions consult this on every pointermove. We
  // expose it as a getter so future runtime updates (e.g. a "Step: 8"
  // toggle in the toolbar) do not require rebinding listeners.
  const snapState: { enabled: boolean; step: number } = {
    enabled: interactive.snap?.enabled ?? DEFAULT_SNAP.enabled,
    step: interactive.snap?.step ?? DEFAULT_SNAP.step,
  };
  const getSnap = (): SnapOptions => ({ enabled: snapState.enabled, step: snapState.step });

  // Grid visibility — toolbar/keyboard toggles flip this and trigger a
  // silent rerender that swaps the grid layer. Snap is independent.
  let gridVisible = interactive.grid?.visible ?? true;
  const gridListeners = new Set<(visible: boolean) => void>();
  const notifyGridListeners = (): void => {
    for (const listener of [...gridListeners]) listener(gridVisible);
  };

  // Render pipeline. The initial mount has to wait until grid state is
  // known so the first SVG already reflects user-supplied visibility.
  let mount: MountResult | null = mountSvg(
    host,
    renderDiagram(bus.getState(), currentRendererOptions(bus.getState())).root,
  );
  syncViewportViewBox();

  // Keep viewBox aligned with host pixels so `panZoom.scale = 1` truly
  // means "1 layout px = 1 screen px" — otherwise `preserveAspectRatio
  // = xMidYMid meet` over a small bbox would shrink the canvas content
  // below 1:1 and the grid pattern (1 px circles) would render
  // sub-pixel and disappear. Re-runs on host resize.
  let resizeObserver: ResizeObserver | null = null;
  const ResizeObserverCtor = (globalThis as { ResizeObserver?: typeof ResizeObserver })
    .ResizeObserver;
  if (typeof ResizeObserverCtor === "function") {
    resizeObserver = new ResizeObserverCtor(() => syncViewportViewBox());
    resizeObserver.observe(host);
  }

  // Cached snapshot of latest validator errors — recomputed on every change.
  let errors: readonly DiagramError[] = collectErrors(bus.getState(), []);
  options.onValidate?.(errors);
  options.onChange?.(snapshotChangeEvent(bus.getState(), errors, null));

  const unsubscribeBus = bus.on("after", ({ command, nextState }) => {
    if (mount) {
      const rendered = renderDiagram(nextState, currentRendererOptions(nextState));
      mount = rerenderSvg(mount, host, rendered.root);
      syncViewportViewBox();
      rebindInteractions();
    }
    errors = collectErrors(nextState, []);
    options.onValidate?.(errors);
    options.onChange?.(snapshotChangeEvent(nextState, errors, command));
  });

  const panZoom = bootstrapPanZoom(host, mount?.root ?? null, interactive.panZoom);

  const fitToViewport = (padding: number = 24): void => {
    if (!panZoom || !mount) return;
    const bbox = computeContentBoundingBox(bus.getState(), options.rendererOptions);
    if (!bbox) return;
    panZoom.fitToContent(bbox, undefined, padding);
  };

  const centerInViewport = (): void => {
    if (!panZoom || !mount) return;
    const bbox = computeContentBoundingBox(bus.getState(), options.rendererOptions);
    if (!bbox) return;
    panZoom.centerContent(bbox);
  };

  const toggleLock = (): boolean => {
    locked = !locked;
    syncLockedAttribute();
    return locked;
  };

  const setLockedFlag = (value: boolean): void => {
    if (locked === value) return;
    locked = value;
    syncLockedAttribute();
  };

  function syncLockedAttribute(): void {
    if (locked) host.setAttribute("data-locked", "true");
    else host.removeAttribute("data-locked");
  }

  const undoAndRerender = (): void => {
    const previousState = bus.getState();
    const next = history.undo();
    if (next === undefined) return;
    handleSilentStateChange(next, previousState);
  };
  const redoAndRerender = (): void => {
    const previousState = bus.getState();
    const next = history.redo();
    if (next === undefined) return;
    handleSilentStateChange(next, previousState);
  };

  const keyboard = bootstrapKeyboard(
    host,
    interactive.keyboard,
    history,
    bus,
    selection,
    panZoom,
    fitToViewport,
    toggleLock,
    undoAndRerender,
    redoAndRerender,
    () => toggleGridFlag(),
  );
  let interactions: InteractionsController | null = bootstrapInteractions(
    interactive.pointer,
    mount?.root ?? null,
    history,
    bus,
    selection,
    options.idFactory,
    getLocked,
    getSnap,
  );

  const setGridVisibleFlag = (value: boolean): void => {
    if (gridVisible === value) return;
    gridVisible = value;
    rerenderForGrid();
    notifyGridListeners();
  };
  const toggleGridFlag = (): boolean => {
    setGridVisibleFlag(!gridVisible);
    return gridVisible;
  };

  const instance: EditorInstance = {
    async loadFromText(text: string): Promise<EditorChangeEvent> {
      const result = await importPuml(text, {
        diagramType: options.diagramType,
        ...(options.idFactory ? { idFactory: options.idFactory } : {}),
        ...(options.layoutOptions ? { layoutOptions: options.layoutOptions } : {}),
      });
      const command = importTextCommand(result.ast, bus.getState());
      history.dispatch(command);
      // `bus.on("after")` already refreshed `errors`; merge parser errors so
      // syntax-level issues don't get hidden behind a clean AST.
      const merged = collectErrors(bus.getState(), result.errors);
      errors = merged;
      options.onValidate?.(merged);
      const event = snapshotChangeEvent(bus.getState(), merged, command);
      options.onChange?.(event);
      return event;
    },

    loadFromJson(text: string): ImportJsonResult {
      const result = importJson(text);
      if (!result.ok) return result;
      if (result.ast.type !== options.diagramType) {
        return {
          ok: false,
          issues: [
            {
              path: ["type"],
              message: `expected diagramType "${options.diagramType}", got "${result.ast.type}"`,
            },
          ],
        };
      }
      const command = importTextCommand(result.ast, bus.getState());
      history.dispatch(command);
      return result;
    },

    exportText(): string {
      return generatePlantUml(bus.getState());
    },

    exportSvg(opts?: ExportSvgOptions): string {
      return exportSvg(bus.getState(), { ...options.rendererOptions, ...opts });
    },

    exportPng(opts?: ExportPngOptions): Promise<Blob> {
      return exportPng(bus.getState(), { ...options.rendererOptions, ...opts });
    },

    exportJson(opts?: ExportJsonOptions): string {
      return exportJson(bus.getState(), opts);
    },

    undo(): boolean {
      const previousState = bus.getState();
      const next = history.undo();
      if (next === undefined) return false;
      // `history.undo` installs state via `bus.setState` which deliberately
      // bypasses the bus event pipeline. Re-render and re-emit manually so
      // listeners stay in sync.
      handleSilentStateChange(next, previousState);
      return true;
    },

    redo(): boolean {
      const previousState = bus.getState();
      const next = history.redo();
      if (next === undefined) return false;
      handleSilentStateChange(next, previousState);
      return true;
    },

    async runAutoLayout(opts?: LayoutOptions): Promise<void> {
      const layoutOpts = opts ?? options.layoutOptions;
      const layout = await runAutoLayout(bus.getState(), layoutOpts);
      const command = applyLayoutCommand(layout.coordinates, bus.getState());
      history.dispatch(command);
    },

    applyTheme(theme: EditorTheme): void {
      activeTheme = theme;
      writeThemeAttribute(host, theme, themeMql);
    },

    dispatch(command: Command): Diagram {
      return history.dispatch(command);
    },

    getState(): Diagram {
      return bus.getState();
    },

    getErrors(): readonly DiagramError[] {
      return errors;
    },

    zoomIn(factor?: number): void {
      panZoom?.zoomIn(factor);
    },
    zoomOut(factor?: number): void {
      panZoom?.zoomOut(factor);
    },
    zoomReset(): void {
      panZoom?.reset();
    },
    fitToView(padding?: number): void {
      fitToViewport(padding);
    },
    centerView(): void {
      centerInViewport();
    },
    setLocked(flag: boolean): void {
      setLockedFlag(flag);
    },
    isLocked(): boolean {
      return locked;
    },
    setGridVisible(flag: boolean): void {
      setGridVisibleFlag(flag);
    },
    toggleGrid(): boolean {
      return toggleGridFlag();
    },
    isGridVisible(): boolean {
      return gridVisible;
    },
    onGridChange(listener: (visible: boolean) => void): () => void {
      gridListeners.add(listener);
      return () => {
        gridListeners.delete(listener);
      };
    },

    bus,
    history,
    panZoom,
    selection,

    destroy(): void {
      unsubscribeBus();
      themeMql?.removeEventListener("change", themeMqlListener);
      resizeObserver?.disconnect();
      resizeObserver = null;
      interactions?.dispose();
      interactions = null;
      keyboard?.dispose();
      panZoom?.dispose();
      mount?.dispose();
      mount = null;
      host.removeAttribute(HOST_DATA_FLAG);
      host.removeAttribute(HOST_THEME_ATTR);
    },
  };

  return instance;

  function handleSilentStateChange(next: Diagram, previousState: Diagram): void {
    if (mount) {
      const rendered = renderDiagram(next, currentRendererOptions(next));
      mount = rerenderSvg(mount, host, rendered.root);
      syncViewportViewBox();
      rebindInteractions();
    }
    errors = collectErrors(next, []);
    options.onValidate?.(errors);
    void previousState;
    options.onChange?.(snapshotChangeEvent(next, errors, null));
  }

  function currentRendererOptions(diagram: Diagram): CreateEditorOptions["rendererOptions"] {
    const merged = withLayoutOverrides(diagram, options.rendererOptions);
    return { ...(merged ?? {}), grid: { visible: gridVisible } };
  }

  function rerenderForGrid(): void {
    if (!mount) return;
    const next = bus.getState();
    const rendered = renderDiagram(next, currentRendererOptions(next));
    mount = rerenderSvg(mount, host, rendered.root);
    syncViewportViewBox();
    rebindInteractions();
  }

  /**
   * Replace the renderer-emitted viewBox (which tightly frames the
   * diagram's bbox) with one that matches the host's pixel rectangle.
   * This makes `panZoom.scale = 1` correspond to a true 1:1 mapping
   * between layout coords and screen pixels — the renderer's default
   * uses `preserveAspectRatio = xMidYMid meet`, which over a small
   * diagram would shrink content below 1:1 and erase the 1 px grid
   * dots. The exporter (`exportSvg`) re-renders without this override,
   * so static output keeps a tight bbox.
   */
  function syncViewportViewBox(): void {
    if (!mount) return;
    const root = mount.root;
    const rect = host.getBoundingClientRect?.();
    const w = Math.max(rect?.width ?? 0, 1);
    const h = Math.max(rect?.height ?? 0, 1);
    root.setAttribute("viewBox", `0 0 ${w} ${h}`);
    root.setAttribute("preserveAspectRatio", "xMinYMin meet");
  }

  function rebindInteractions(): void {
    if (!mount) return;
    const content = mount.root.querySelector('[data-uml-content="true"]');
    if (content instanceof SVGGraphicsElement) {
      interactions?.rebind(mount.root, content);
      panZoom?.rebindTarget(content);
    }
  }
}

function ensureHostMarkup(host: Element): void {
  host.setAttribute(HOST_DATA_FLAG, "");
}

function resolveInitialDiagram(options: CreateEditorOptions): Diagram {
  if (options.initialDiagram) {
    if (options.initialDiagram.type !== options.diagramType) {
      throw new Error(
        `createEditor: initialDiagram.type ("${options.initialDiagram.type}") does not match diagramType ("${options.diagramType}")`,
      );
    }
    return cloneDiagram(options.initialDiagram);
  }
  // initialText is loaded async after construction — `loadFromText` is the
  // only path that calls the parser. The constructor stays synchronous so
  // hosts can rely on `getState()` returning a non-null Diagram immediately.
  return createEmptyDiagram(options.diagramType);
}

/**
 * Merge persisted `metadata.layoutOverrides` into the renderer options'
 * `coordinates`. Without this, every re-render after a `MoveNodeCommand`
 * snaps nodes back to the deterministic grid because the renderer
 * defaults to `layoutGrid` when `coordinates` is absent.
 */
function withLayoutOverrides(
  diagram: Diagram,
  rendererOptions: CreateEditorOptions["rendererOptions"],
): CreateEditorOptions["rendererOptions"] {
  const overrides = diagram.metadata.layoutOverrides;
  if (!overrides || Object.keys(overrides).length === 0) return rendererOptions;
  // Caller's coordinates take precedence — they're an explicit override.
  if (rendererOptions?.coordinates) return rendererOptions;
  return { ...(rendererOptions ?? {}), coordinates: overrides };
}

function bootstrapPanZoom(
  host: Element,
  svgRoot: SVGElement | null,
  flag: boolean | PanZoomOptions | undefined,
): PanZoomController | null {
  if (flag === false) return null;
  if (flag === undefined) return null;
  const provided: PanZoomOptions = typeof flag === "object" ? flag : {};
  // Pan / zoom transforms live on the inner content group, not the
  // outer <svg> element. Setting `transform` on an SVG element with
  // `width="100%"` only moves its CSS box, leaving the rendered
  // diagram pinned in place — the inner <g> is what we actually want
  // to translate / scale.
  let resolvedTarget: SVGGraphicsElement | undefined = provided.target;
  if (!resolvedTarget && svgRoot) {
    const inner = svgRoot.querySelector('[data-uml-content="true"]');
    if (inner instanceof SVGGraphicsElement) {
      resolvedTarget = inner;
    }
  }
  const options: PanZoomOptions = resolvedTarget
    ? { ...provided, target: resolvedTarget }
    : provided;
  return createPanZoomController(host as HTMLElement, options);
}

function bootstrapInteractions(
  flag: boolean | undefined,
  svgRoot: SVGElement | null,
  history: History,
  bus: CommandBus,
  selection: SelectionModel,
  idFactory: (() => string) | undefined,
  getLocked: () => boolean,
  getSnap: () => SnapOptions,
): InteractionsController | null {
  if (flag === false) return null;
  if (flag === undefined) return null;
  if (!svgRoot) return null;
  const content = svgRoot.querySelector('[data-uml-content="true"]');
  if (!(content instanceof SVGGraphicsElement)) return null;
  return attachInteractions({
    svg: svgRoot,
    contentGroup: content,
    history,
    bus,
    selection,
    getLocked,
    getSnap,
    ...(idFactory ? { idFactory } : {}),
  });
}

function bootstrapKeyboard(
  host: Element,
  flag: boolean | KeyboardNavigationOptions | undefined,
  history: History,
  bus: CommandBus,
  selection: SelectionModel,
  panZoom: PanZoomController | null,
  fitToViewport: (padding?: number) => void,
  toggleLock: () => boolean,
  doUndo: () => void,
  doRedo: () => void,
  doToggleGrid: () => void,
): KeyboardNavigationController | null {
  if (flag === false) return null;
  if (flag === undefined) return null;
  const baseOptions: KeyboardNavigationOptions =
    typeof flag === "object" ? { ...flag } : ({} as KeyboardNavigationOptions);

  // Wire defaults the editor knows how to satisfy without delegating to
  // the caller. `Delete` removes whichever ids the selection holds;
  // arrow keys nudge the focused node by `step` px through `MoveNodeCommand`,
  // keeping every interaction reversible via the history stack.
  const merged: KeyboardNavigationOptions = {
    ...baseOptions,
    onUndo: baseOptions.onUndo ?? doUndo,
    onRedo: baseOptions.onRedo ?? doRedo,
    onDelete:
      baseOptions.onDelete ??
      ((): void => {
        const ids = [...selection.get()];
        if (ids.length === 0) return;
        const diagram = bus.getState();
        const knownNodes = new Set(diagram.nodes.map((n) => n.id));
        const knownGroups = new Set(diagram.groups.map((g) => g.id));
        for (const id of ids) {
          if (knownNodes.has(id)) {
            history.dispatch(removeNodeCommand(id, bus.getState()));
          } else if (knownGroups.has(id)) {
            history.dispatch(removeGroupCommand(id, bus.getState()));
          }
        }
        selection.clear();
      }),
    onArrow:
      baseOptions.onArrow ??
      ((direction, scale): void => {
        const ids = [...selection.get()];
        if (ids.length === 0) return;
        const dx = direction === "left" ? -scale : direction === "right" ? scale : 0;
        const dy = direction === "up" ? -scale : direction === "down" ? scale : 0;
        if (dx === 0 && dy === 0) return;
        for (const id of ids) {
          const diagram = bus.getState();
          const previous = diagram.metadata.layoutOverrides?.[id] ?? { x: 0, y: 0 };
          const next = { x: previous.x + dx, y: previous.y + dy };
          history.dispatch(moveNodeCommand(id, next, diagram));
        }
      }),
    onZoomIn: baseOptions.onZoomIn ?? ((): void => panZoom?.zoomIn()),
    onZoomOut: baseOptions.onZoomOut ?? ((): void => panZoom?.zoomOut()),
    onZoomReset: baseOptions.onZoomReset ?? ((): void => panZoom?.reset()),
    onFitToView: baseOptions.onFitToView ?? ((): void => fitToViewport()),
    onToggleLock:
      baseOptions.onToggleLock ??
      ((): void => {
        toggleLock();
      }),
    onSelectAll:
      baseOptions.onSelectAll ??
      ((): void => {
        const ids = bus.getState().nodes.map((n) => n.id);
        selection.set(ids);
      }),
    onToggleGrid:
      baseOptions.onToggleGrid ??
      ((): void => {
        doToggleGrid();
      }),
  };
  return attachKeyboardNavigation(host as HTMLElement, merged);
}

function collectErrors(diagram: Diagram, parserErrors: readonly DiagramError[]): DiagramError[] {
  const adopted = adoptParserErrors(parserErrors);
  return runAllValidators(diagram, adopted).errors;
}

function snapshotChangeEvent(
  ast: Diagram,
  errors: readonly DiagramError[],
  command: Command | null,
): EditorChangeEvent {
  return {
    text: generatePlantUml(ast),
    ast,
    errors,
    command,
  };
}

function matchPrefersColorScheme(): MediaQueryList | null {
  const mm = (globalThis as { matchMedia?: (query: string) => MediaQueryList }).matchMedia;
  if (typeof mm !== "function") return null;
  try {
    return mm.call(globalThis, "(prefers-color-scheme: dark)");
  } catch {
    return null;
  }
}

function writeThemeAttribute(host: Element, theme: EditorTheme, mql: MediaQueryList | null): void {
  const resolved = theme === "auto" ? (mql?.matches ? "dark" : "light") : theme;
  host.setAttribute(HOST_THEME_ATTR, resolved);
}

/**
 * Recompute the diagram's content bounding box from the current AST so
 * `fitToView` can frame it without parsing the SVG. Mirrors the bbox
 * math used inside `renderDiagram` but is cheaper because we don't
 * build a vnode tree.
 */
function computeContentBoundingBox(
  diagram: Diagram,
  rendererOptions: CreateEditorOptions["rendererOptions"],
): { x: number; y: number; width: number; height: number } | null {
  if (diagram.nodes.length === 0) return null;
  const nodeWidth = rendererOptions?.nodeWidth ?? 200;
  const nodeHeight = rendererOptions?.nodeHeight ?? 80;
  const padding = rendererOptions?.canvasPadding ?? 40;
  const overrides = diagram.metadata.layoutOverrides ?? {};
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const node of diagram.nodes) {
    const coord = overrides[node.id] ?? { x: 0, y: 0 };
    if (coord.x < minX) minX = coord.x;
    if (coord.y < minY) minY = coord.y;
    if (coord.x + nodeWidth > maxX) maxX = coord.x + nodeWidth;
    if (coord.y + nodeHeight > maxY) maxY = coord.y + nodeHeight;
  }
  if (!Number.isFinite(minX)) return null;
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}
