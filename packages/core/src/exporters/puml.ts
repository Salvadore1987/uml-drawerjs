import { generatePlantUml } from "../generator/index.js";
import { runAutoLayout } from "../layout/index.js";
import type { LayoutOptions } from "../layout/types.js";
import type { Diagram, DiagramError, DiagramType } from "../model/types.js";
import { parsePlantUml } from "../parser/index.js";
import { applyLayoutCommand } from "../commands/applyLayout.js";

/**
 * `.puml` export — a thin wrapper over the generator. Lives in `exporters/`
 * so callers don't need to know which inner-hexagon module produced the
 * text; future format gates (file footer, license header) hook here.
 */
export function exportPuml(diagram: Diagram): string {
  return generatePlantUml(diagram);
}

export interface ImportPumlOptions {
  /** Diagram type — fixed at creation, not inferred from source. */
  readonly diagramType: DiagramType;
  /** Optional explicit id; otherwise uuidv7 is used. */
  readonly diagramId?: string;
  /** ID factory used for newly-allocated AST elements. */
  readonly idFactory?: () => string;
  /**
   * Auto-layout policy. `"missing"` (default) runs layout only when the
   * imported text has no `' @drawer:meta layoutOverrides`. `"always"`
   * recomputes from scratch; `"never"` leaves coordinates absent.
   */
  readonly layoutMode?: "missing" | "always" | "never";
  /** Forwarded to `runAutoLayout` when layout runs. */
  readonly layoutOptions?: LayoutOptions;
}

export interface ImportPumlResult {
  readonly ast: Diagram;
  readonly errors: DiagramError[];
  /** Which layout path actually executed during import. */
  readonly layoutEngine: "elk" | "sequence" | "grid" | "preserved" | "skipped";
}

/**
 * Import a PlantUML source string into a `Diagram`. When the source
 * carries no `' @drawer:meta layoutOverrides {…}` annotations, runs
 * auto-layout so the imported diagram is immediately renderable.
 *
 * The function is async because `runAutoLayout` may await the lazy ELK
 * import. Callers that want a synchronous fast-path can pass
 * `layoutMode: "never"`.
 */
export async function importPuml(
  text: string,
  options: ImportPumlOptions,
): Promise<ImportPumlResult> {
  const parseOptions: Parameters<typeof parsePlantUml>[1] = { diagramType: options.diagramType };
  if (options.diagramId !== undefined) parseOptions.diagramId = options.diagramId;
  if (options.idFactory !== undefined) parseOptions.idFactory = options.idFactory;
  const { ast, errors } = parsePlantUml(text, parseOptions);

  const policy = options.layoutMode ?? "missing";
  const hasLayoutMeta =
    ast.metadata.layoutOverrides !== undefined &&
    Object.keys(ast.metadata.layoutOverrides).length > 0;

  if (policy === "never" || (policy === "missing" && hasLayoutMeta)) {
    return {
      ast,
      errors,
      layoutEngine: hasLayoutMeta ? "preserved" : "skipped",
    };
  }

  const layout = await runAutoLayout(ast, options.layoutOptions);
  const command = applyLayoutCommand(layout.coordinates, ast);
  return {
    ast: command.apply(ast),
    errors,
    layoutEngine: layout.engine,
  };
}
