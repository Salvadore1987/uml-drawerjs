import type { Diagram } from "./types.js";

/**
 * Returns a deep clone of a `Diagram`. Used when a caller needs an
 * independent snapshot before issuing mutations through the command bus.
 *
 * Implemented over `structuredClone` (Node ≥ 17, all evergreen browsers),
 * so `Map`, `Set`, `ArrayBuffer`, and similar host objects survive the
 * round-trip. AST nodes are pure data, so nothing in scope hits the
 * structured-clone restrictions.
 */
export function cloneDiagram(diagram: Diagram): Diagram {
  return structuredClone(diagram);
}
