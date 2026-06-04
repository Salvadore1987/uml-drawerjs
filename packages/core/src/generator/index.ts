import type { Diagram, DiagramType } from "../model/types.js";
import { renderC4 } from "./c4.js";
import { renderClass } from "./class.js";
import { renderEr } from "./er.js";
import { buildAliasIndex, formatDiagramMeta } from "./format.js";
import { renderSequence } from "./sequence.js";

/**
 * Generate a PlantUML source string from a `Diagram` AST. The generator is
 * the inverse of `parsePlantUml`: feeding the output back through the
 * parser yields an AST equivalent to the input (modulo the determinism
 * provided by the caller's `idFactory`).
 *
 * The output is **normalised**: deterministic ordering, canonical arrow
 * direction per edge kind, single-space separators. Per-element style and
 * layout overrides are emitted as a `' @drawer:meta {...}` comment that
 * other PlantUML renderers ignore. Anything captured into `metadata.opaque`
 * by the parser is emitted verbatim before `@enduml`.
 */
export function generatePlantUml(diagram: Diagram): string {
  const aliases = buildAliasIndex(diagram);
  const lines: string[] = ["@startuml"];

  // C4 macros (Person / System / Container / Component / Boundary / Rel)
  // are not built-in PlantUML keywords — they live in the C4-PlantUML
  // stdlib. Emitting the matching `!include` makes the output portable to
  // any standard PlantUML renderer (plantuml.com, IntelliJ, vscode-plantuml,
  // GitHub render). Without it the output is unusable outside our editor.
  const includeLine = c4StdlibInclude(diagram.type);
  if (includeLine !== null) lines.push(includeLine);

  if (diagram.title !== undefined && diagram.title !== "") {
    lines.push(`title ${diagram.title}`);
  }

  const metaLine = formatDiagramMeta(diagram);
  if (metaLine !== null) lines.push(metaLine);

  lines.push(...renderBody(diagram, aliases));

  if (diagram.metadata.opaque) {
    for (const opaque of diagram.metadata.opaque) lines.push(opaque);
  }

  lines.push("@enduml");
  return `${lines.join("\n")}\n`;
}

function c4StdlibInclude(type: DiagramType): string | null {
  // Stdlib short form. PlantUML's canonical server (plantuml.com) bundles
  // the C4 stdlib and resolves this against it. URL-based includes were
  // tried in 0.1.2 to support planttext.com, but PlantUML's INTERNET
  // security profile rejected the github URL on plantuml.com itself, so
  // we reverted. The parser strips any `!include` line on read, so this
  // change is invisible on round-trip.
  switch (type) {
    case "c4-context":
      return "!include <C4/C4_Context>";
    case "c4-container":
      return "!include <C4/C4_Container>";
    case "c4-component":
      return "!include <C4/C4_Component>";
    default:
      return null;
  }
}

function renderBody(diagram: Diagram, aliases: Map<string, string>): string[] {
  switch (diagram.type) {
    case "c4-context":
    case "c4-container":
    case "c4-component":
      return renderC4(diagram, aliases);
    case "class":
      return renderClass(diagram, aliases);
    case "er":
      return renderEr(diagram, aliases);
    case "sequence":
      return renderSequence(diagram, aliases);
  }
}

export { aliasFromId, escapeStringLiteral, formatDiagramMeta } from "./format.js";
