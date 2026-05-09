import { linter } from "@codemirror/lint";
import type { Action, Diagnostic } from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import type { Command } from "@uml-drawer/core/commands";
import { parsePlantUml } from "@uml-drawer/core/parser";
import { attachQuickFixes, runAllValidators, adoptParserErrors } from "@uml-drawer/core/validators";
import type { Diagram, DiagramError, DiagramType } from "@uml-drawer/core/model";

/**
 * CodeMirror lint integration. The linter re-parses the document on each
 * debounced change (default 750 ms) and feeds the result through the same
 * `runAllValidators` pipeline used by `createEditor`. Each `DiagramError`
 * is mapped onto a CodeMirror `Diagnostic`; quick-fixes are attached as
 * `actions` that, when invoked, dispatch a CQRS command back through the
 * caller's bus.
 *
 * The bus is supplied by the host via `dispatch`. The linter does not
 * own one — the editor instance does. When the lint extension lives in a
 * standalone `EditorView` (e.g. a docs page), pass `dispatch: () => {}`
 * to disable quick-fixes entirely.
 */
export interface PlantUmlLintOptions {
  /** Diagram type — fixed for the document, mirroring `createEditor`. */
  readonly diagramType: DiagramType;
  /**
   * Callback invoked when a quick-fix action is triggered. Usually
   * `editor.dispatch` from `createEditor`. Returning `false` (or
   * throwing) prevents the linter from optimistically clearing the
   * diagnostic.
   */
  readonly dispatch?: (command: Command) => void | boolean;
  /**
   * Provide the current diagram synchronously (the editor's
   * `getState()`). When omitted, the linter uses the freshly-parsed AST,
   * which is correct for highlighting but means quick-fixes operate on a
   * snapshot that may not yet include later commands. Passing the live
   * accessor keeps quick-fix `build()` calls aligned with the bus state.
   */
  readonly getDiagram?: () => Diagram | null;
  /** Override the lint debounce window (ms). */
  readonly delay?: number;
  /**
   * Optional id factory for the parser — surfaces in tests so AST ids
   * stay deterministic between the editor and the linter. Defaults to
   * the parser's built-in `uuidv7`.
   */
  readonly idFactory?: () => string;
  /** Filter or rewrite diagnostics before they are returned to CM. */
  readonly transformDiagnostic?: (diagnostic: Diagnostic, error: DiagramError) => Diagnostic | null;
}

/**
 * Build a CodeMirror linter extension. The returned `Extension` can be
 * passed alongside `plantUml()` and `lintGutter()`.
 *
 *   import { plantUml, plantUmlLint } from "@uml-drawer/codemirror-plantuml";
 *   const view = new EditorView({
 *     extensions: [plantUml(), plantUmlLint({ diagramType: "class", dispatch: editor.dispatch })],
 *   });
 */
export function plantUmlLint(options: PlantUmlLintOptions): Extension {
  const config: { delay?: number } = {};
  if (options.delay !== undefined) config.delay = options.delay;
  return linter((view) => runLinter(view, options), config);
}

export function runLinter(view: EditorView, options: PlantUmlLintOptions): readonly Diagnostic[] {
  const text = view.state.doc.toString();
  const diagnostics = computeDiagnostics(text, options);
  return diagnostics;
}

/**
 * Compute the full set of diagnostics for `text`. Exported separately
 * from `plantUmlLint` so unit tests can drive the pipeline without a
 * live `EditorView`.
 */
export function computeDiagnostics(text: string, options: PlantUmlLintOptions): Diagnostic[] {
  const parseOptions: Parameters<typeof parsePlantUml>[1] = {
    diagramType: options.diagramType,
  };
  if (options.idFactory) parseOptions.idFactory = options.idFactory;
  const { ast, errors: parserErrors } = parsePlantUml(text, parseOptions);

  const diagram = options.getDiagram?.() ?? ast;
  const adopted = adoptParserErrors(parserErrors);
  const merged = runAllValidators(diagram, adopted).errors;
  const withFixes = attachQuickFixes(merged, diagram, (command) => {
    options.dispatch?.(command);
  });

  const docLength = text.length;
  const out: Diagnostic[] = [];
  for (const error of withFixes) {
    const mapped = toDiagnostic(error, docLength, options);
    if (mapped) out.push(mapped);
  }
  return out;
}

function toDiagnostic(
  error: DiagramError,
  docLength: number,
  options: PlantUmlLintOptions,
): Diagnostic | null {
  const range = clampRange(error.range, docLength);
  const actions: Action[] = [];
  if (error.fix) {
    actions.push({
      name: error.fix.label,
      apply(): void {
        error.fix?.apply();
      },
    });
  }

  const diagnostic: Diagnostic = {
    from: range.from,
    to: range.to,
    severity: error.severity === "info" ? "info" : error.severity,
    source: `uml-drawer/${error.code}`,
    message: error.message,
    ...(actions.length > 0 ? { actions } : {}),
  };

  if (options.transformDiagnostic) {
    return options.transformDiagnostic(diagnostic, error);
  }
  return diagnostic;
}

function clampRange(range: DiagramError["range"], docLength: number): { from: number; to: number } {
  if (!range) {
    // No range means the error is document-wide. Anchor it to the start
    // of the document so CodeMirror still draws a marker — `to: 0` would
    // collapse and become invisible without `markClass`.
    return { from: 0, to: Math.min(1, docLength) };
  }
  const from = clamp(range.from, 0, docLength);
  const to = clamp(range.to, 0, docLength);
  if (to <= from) {
    return { from, to: Math.min(from + 1, docLength) };
  }
  return { from, to };
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
