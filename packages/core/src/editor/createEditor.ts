import { applyLayoutCommand, importTextCommand } from "../commands/index.js";
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
  attachKeyboardNavigation,
  createPanZoomController,
  mountSvg,
  rerenderSvg,
  renderDiagram,
} from "../renderer/index.js";
import type {
  KeyboardNavigationController,
  KeyboardNavigationOptions,
  MountResult,
  PanZoomController,
  PanZoomOptions,
} from "../renderer/index.js";
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

  // Render pipeline.
  let mount: MountResult | null = mountInitialRender(host, bus.getState(), options);

  // Cached snapshot of latest validator errors — recomputed on every change.
  let errors: readonly DiagramError[] = collectErrors(bus.getState(), []);
  options.onValidate?.(errors);
  options.onChange?.(snapshotChangeEvent(bus.getState(), errors, null));

  const unsubscribeBus = bus.on("after", ({ command, nextState }) => {
    if (mount) {
      const rendered = renderDiagram(nextState, options.rendererOptions);
      mount = rerenderSvg(mount, host, rendered.root);
    }
    errors = collectErrors(nextState, []);
    options.onValidate?.(errors);
    options.onChange?.(snapshotChangeEvent(nextState, errors, command));
  });

  // Optional interactivity — both controllers are disposed in `destroy()`.
  const interactive = options.interactive ?? {};
  const panZoom = bootstrapPanZoom(host, mount?.root ?? null, interactive.panZoom);
  const keyboard = bootstrapKeyboard(host, interactive.keyboard, history);

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

    bus,
    history,
    panZoom,

    destroy(): void {
      unsubscribeBus();
      themeMql?.removeEventListener("change", themeMqlListener);
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
      const rendered = renderDiagram(next, options.rendererOptions);
      mount = rerenderSvg(mount, host, rendered.root);
    }
    errors = collectErrors(next, []);
    options.onValidate?.(errors);
    void previousState;
    options.onChange?.(snapshotChangeEvent(next, errors, null));
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

function mountInitialRender(
  host: Element,
  diagram: Diagram,
  options: CreateEditorOptions,
): MountResult {
  const rendered = renderDiagram(diagram, options.rendererOptions);
  return mountSvg(host, rendered.root);
}

function bootstrapPanZoom(
  host: Element,
  target: SVGElement | null,
  flag: boolean | PanZoomOptions | undefined,
): PanZoomController | null {
  if (flag === false) return null;
  if (flag === undefined) return null;
  const provided: PanZoomOptions = typeof flag === "object" ? flag : {};
  const options: PanZoomOptions =
    provided.target === undefined && target
      ? { ...provided, target: target as unknown as SVGGraphicsElement }
      : provided;
  return createPanZoomController(host as HTMLElement, options);
}

function bootstrapKeyboard(
  host: Element,
  flag: boolean | KeyboardNavigationOptions | undefined,
  history: History,
): KeyboardNavigationController | null {
  if (flag === false) return null;
  if (flag === undefined) return null;
  const baseOptions: KeyboardNavigationOptions =
    typeof flag === "object" ? { ...flag } : ({} as KeyboardNavigationOptions);
  // Wire undo / redo to the editor's history if the caller hasn't already.
  const merged: KeyboardNavigationOptions = {
    ...baseOptions,
    onUndo:
      baseOptions.onUndo ??
      ((): void => {
        history.undo();
      }),
    onRedo:
      baseOptions.onRedo ??
      ((): void => {
        history.redo();
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
