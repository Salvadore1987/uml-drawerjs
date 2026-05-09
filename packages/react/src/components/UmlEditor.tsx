import { createEditor } from "@uml-drawer/core/editor";
import type {
  CreateEditorOptions,
  EditorChangeEvent,
  EditorInstance,
  EditorTheme,
} from "@uml-drawer/core/editor";
import type { DiagramError, DiagramType } from "@uml-drawer/core/model";
import { createSelectionModel } from "@uml-drawer/core/renderer";
import type { SelectionModel } from "@uml-drawer/core/renderer";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UmlEditorContext } from "../internal/context.js";
import { UmlEditorInternalContext } from "../internal/internal-context.js";
import type { PaletteFilter } from "./Palette.js";

export interface UmlEditorLayout {
  /** Where the palette goes. Defaults to `"left"`. */
  readonly palette?: "left" | "right" | "hidden";
  /** Where the props panel goes. Defaults to `"right"`. */
  readonly props?: "left" | "right" | "hidden";
  /** Text-editor placement. Defaults to `"bottom"`. */
  readonly text?: "top" | "bottom" | "hidden";
}

export interface UmlEditorProps {
  /** Diagram type — fixed for the lifetime of the mount. */
  readonly diagramType: DiagramType;
  /** Controlled PlantUML source. Pair with `onChange` to lift state. */
  readonly value?: string;
  /** Initial PlantUML source for the uncontrolled flavour. */
  readonly defaultValue?: string;
  /** Called after every command (including undo / redo / import). */
  readonly onChange?: (event: EditorChangeEvent) => void;
  /** Called whenever the validator stack produces a fresh result. */
  readonly onValidate?: (errors: readonly DiagramError[]) => void;
  /** Override theme application. Defaults to `"auto"`. */
  readonly theme?: EditorTheme;
  /** Layout slot configuration. */
  readonly layout?: UmlEditorLayout;
  /** Filter the default Palette item list down to a subset. */
  readonly paletteFilter?: PaletteFilter;
  /**
   * Auto-run ELK layout right after the initial parse if the diagram
   * has no `layoutOverrides`. Useful for showcase samples; pass `false`
   * when consumers want full control over node positions.
   * Defaults to `true`.
   */
  readonly autoLayoutOnLoad?: boolean;
  /** Forwarded to `createEditor` — cuts through to the underlying core. */
  readonly editorOptions?: Omit<
    CreateEditorOptions,
    "diagramType" | "initialText" | "initialDiagram" | "theme" | "onChange" | "onValidate"
  >;
  /** Children rendered inside the provider. */
  readonly children?: ReactNode;
  /** Optional class on the root container. */
  readonly className?: string;
}

const DEFAULT_LAYOUT: Required<UmlEditorLayout> = {
  palette: "left",
  props: "right",
  text: "bottom",
};

interface UmlEditorRenderState {
  editor: EditorInstance | null;
  selection: SelectionModel;
}

/**
 * Root component. Owns:
 *
 *   - one `EditorInstance` (rebuilt on `diagramType` change),
 *   - one `SelectionModel`, shared between the canvas and the props panel,
 *   - a layout context exposing `paletteFilter` and slot positions.
 *
 * The instance is constructed lazily once a `<Canvas>` child registers
 * its DOM node. Hosts that omit `<Canvas>` get a no-canvas tree where
 * the hooks throw — that mirrors the spec's invariant that the canvas
 * is the canonical entry point for the SVG renderer.
 */
export function UmlEditor({
  diagramType,
  value,
  defaultValue,
  onChange,
  onValidate,
  theme,
  layout,
  paletteFilter,
  autoLayoutOnLoad = true,
  editorOptions,
  children,
  className,
}: UmlEditorProps): JSX.Element {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [editor, setEditor] = useState<EditorInstance | null>(null);

  // Selection model is shared across components and stable for the
  // component's lifetime — we deliberately keep it outside the
  // editor-construction effect so a `diagramType` change does not blow
  // away the user's selection state.
  const selectionRef = useRef<SelectionModel | null>(null);
  if (!selectionRef.current) selectionRef.current = createSelectionModel();
  const selection = selectionRef.current;

  // Stable refs let the effect avoid re-creating the editor when the
  // caller passes new closure identities for callbacks on every render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onValidateRef = useRef(onValidate);
  onValidateRef.current = onValidate;

  const editorOptionsRef = useRef(editorOptions);
  editorOptionsRef.current = editorOptions;

  const initialTextRef = useRef<string | null>(value ?? defaultValue ?? null);
  const [initialLoaded, setInitialLoaded] = useState<boolean>(false);

  useEffect(() => {
    if (!host) return;
    setInitialLoaded(false);
    // Default to enabling pointer + keyboard interactions and hand the
    // shared SelectionModel to core so Delete / arrow-nudge / pointer
    // selection stay coherent between React panels and the SVG canvas.
    const passedOptions = editorOptionsRef.current ?? {};
    const passedInteractive = passedOptions.interactive ?? {};
    const resolvedInteractive = {
      panZoom: passedInteractive.panZoom ?? true,
      keyboard: passedInteractive.keyboard ?? true,
      pointer: passedInteractive.pointer ?? true,
      selection: passedInteractive.selection ?? selection,
    };
    const instance = createEditor(host, {
      diagramType,
      ...(theme ? { theme } : {}),
      ...passedOptions,
      interactive: resolvedInteractive,
      onChange: (event) => onChangeRef.current?.(event),
      onValidate: (errors) => onValidateRef.current?.(errors),
    });
    setEditor(instance);

    // Apply the initial text. We don't pass it through `createEditor`
    // because that path is async and would race with React's effect
    // ordering; doing it explicitly here keeps the initial state
    // observable to subscribers in the same tick the bus emits.
    const initialText = initialTextRef.current;
    if (initialText !== null && initialText !== undefined) {
      void instance
        .loadFromText(initialText)
        .then(async () => {
          if (autoLayoutOnLoad) {
            const ast = instance.getState();
            if (ast.nodes.length > 0) {
              const overrides = ast.metadata.layoutOverrides ?? {};
              if (Object.keys(overrides).length === 0) {
                await instance.runAutoLayout();
              }
            }
          }
          // Frame whatever ended up in the AST so the user sees the
          // whole diagram on first paint, even when consumers supplied
          // their own `layoutOverrides`.
          requestAnimationFrame(() => instance.fitToView());
        })
        .catch(() => {
          /* validator surfaces the error */
        })
        .finally(() => {
          setInitialLoaded(true);
        });
    } else {
      setInitialLoaded(true);
    }

    return () => {
      instance.destroy();
      setEditor(null);
    };
  }, [host, diagramType, theme]);

  // Controlled prop sync — only fires on real value changes, not on
  // every render. We compare against `editor.exportText()` so external
  // edits propagate without ricocheting through `onChange`. We skip
  // until the construction effect's initial load + auto-layout settle,
  // otherwise this effect would race-overwrite the layouted AST with a
  // raw re-parse of the same `value` string.
  useEffect(() => {
    if (!editor) return;
    if (value === undefined) return;
    if (!initialLoaded) return;
    const current = editor.exportText();
    if (current === value) return;
    void editor.loadFromText(value).catch(() => {
      /* swallow — surfaced via onValidate */
    });
  }, [editor, value, initialLoaded]);

  const registerCanvas = useCallback((node: HTMLDivElement | null) => {
    setHost(node);
  }, []);

  const internalValue = useMemo(() => ({ registerCanvas }), [registerCanvas]);

  const renderState: UmlEditorRenderState = { editor, selection };

  const resolvedLayout = { ...DEFAULT_LAYOUT, ...layout };
  const filterValue = useMemo(() => paletteFilter ?? null, [paletteFilter]);

  const composedClassName = [
    "uml-editor",
    `uml-editor--palette-${resolvedLayout.palette}`,
    `uml-editor--props-${resolvedLayout.props}`,
    `uml-editor--text-${resolvedLayout.text}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const externalValue = useMemo(
    () => ({
      editor: renderState.editor,
      selection: renderState.selection,
      paletteFilter: filterValue,
      layout: resolvedLayout,
    }),
    [renderState.editor, renderState.selection, filterValue, resolvedLayout],
  );

  return (
    <UmlEditorInternalContext.Provider value={internalValue}>
      <UmlEditorContext.Provider value={externalValue}>
        <div className={composedClassName} data-uml-editor-root="">
          {children}
        </div>
      </UmlEditorContext.Provider>
    </UmlEditorInternalContext.Provider>
  );
}
