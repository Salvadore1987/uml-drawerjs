import { uuidv7 } from "./ids.js";
import { SCHEMA_VERSION } from "./schema.js";
import type { Diagram, DiagramType } from "./types.js";

/**
 * Returns a fresh, empty `Diagram` of the requested type. The resulting
 * AST contains only structural defaults — no nodes, edges, or groups — and
 * already carries `metadata.schemaVersion`, so it serializes cleanly.
 */
export function createEmptyDiagram(type: DiagramType): Diagram {
  return {
    id: uuidv7(),
    type,
    nodes: [],
    edges: [],
    groups: [],
    metadata: {
      schemaVersion: SCHEMA_VERSION,
    },
  };
}
