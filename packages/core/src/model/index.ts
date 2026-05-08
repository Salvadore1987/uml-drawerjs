/**
 * Public model surface — re-exports every AST type, factory, query, clone,
 * schema, and validation utility. Subpath import target:
 *
 *   import type { Diagram, Node, Edge } from "@uml-drawer/core/model";
 */

export * from "./types.js";
export { uuidv7, isUuidv7 } from "./ids.js";
export { createEmptyDiagram } from "./factory.js";
export { cloneDiagram } from "./clone.js";
export {
  findNode,
  findEdge,
  findGroup,
  getEdgesOfNode,
  getOutgoingEdges,
  getIncomingEdges,
  getParentGroups,
} from "./query.js";
export { SCHEMA_VERSION, diagramJsonSchema } from "./schema.js";
export {
  diagramSchema,
  parseDiagram,
  parseDiagramOrThrow,
  isCurrentSchemaVersion,
} from "./validation.js";
export type { DiagramParseResult, DiagramParseSuccess, DiagramParseFailure } from "./validation.js";
