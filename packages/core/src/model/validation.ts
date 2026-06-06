import { z } from "zod";

import { SCHEMA_VERSION } from "./schema.js";
import type { Diagram } from "./types.js";

/**
 * zod schemas for runtime validation of the AST. These are the API
 * boundary — the parser, the JSON importer, and any external client of the
 * vanilla `createEditor` API run their inputs through `parseDiagram` so that
 * downstream code can rely on the static `Diagram` type.
 *
 * Keep these in lock-step with `types.ts` and `schema.ts`. A drift here is
 * caught by the round-trip suite in `validation.test.ts`.
 */

const visibilitySchema = z.enum(["public", "protected", "private", "package"]);

const arrowheadSchema = z.enum([
  "none",
  "arrow",
  "open-arrow",
  "diamond",
  "open-diamond",
  "triangle",
  "open-triangle",
]);

const diagramTypeSchema = z.enum([
  "c4-context",
  "c4-container",
  "c4-component",
  "class",
  "er",
  "sequence",
]);

const nodeKindSchema = z.enum([
  "person",
  "person-external",
  "system",
  "system-external",
  "container",
  "container-external",
  "component",
  "component-external",
  "database",
  "queue",
  "class",
  "interface",
  "abstract-class",
  "enum",
  "entity",
  "lifeline",
  "actor",
  "lifeline-boundary",
  "lifeline-control",
  "lifeline-entity",
  "lifeline-collections",
]);

const edgeKindSchema = z.enum([
  "uses",
  "depends-on",
  "association",
  "inheritance",
  "realization",
  "composition",
  "aggregation",
  "dependency",
  "one-to-one",
  "one-to-many",
  "many-to-many",
  "sync-call",
  "async-call",
  "return",
  "create",
  "destroy",
  "lost-message",
  "found-message",
]);

const groupKindSchema = z.enum(["boundary", "package", "system"]);

const nodeStyleSchema = z
  .object({
    fill: z.string().optional(),
    stroke: z.string().optional(),
    strokeWidth: z.number().optional(),
    strokeDasharray: z.string().optional(),
    textColor: z.string().optional(),
    fontFamily: z.string().optional(),
    fontSize: z.number().optional(),
    borderRadius: z.number().optional(),
  })
  .strict();

const edgeStyleSchema = z
  .object({
    stroke: z.string().optional(),
    strokeWidth: z.number().optional(),
    strokeDasharray: z.string().optional(),
    textColor: z.string().optional(),
    fontFamily: z.string().optional(),
    fontSize: z.number().optional(),
    arrowStart: arrowheadSchema.optional(),
    arrowEnd: arrowheadSchema.optional(),
  })
  .strict();

const operationParameterSchema = z
  .object({
    name: z.string(),
    type: z.string().optional(),
    default: z.string().optional(),
  })
  .strict();

const operationSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    parameters: z.array(operationParameterSchema).optional(),
    returnType: z.string().optional(),
    visibility: visibilitySchema.optional(),
    static: z.boolean().optional(),
    abstract: z.boolean().optional(),
    description: z.string().optional(),
  })
  .strict();

const attributeSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.string().optional(),
    visibility: visibilitySchema.optional(),
    multiplicity: z.string().optional(),
    default: z.string().optional(),
    readonly: z.boolean().optional(),
    static: z.boolean().optional(),
    primaryKey: z.boolean().optional(),
    foreignKey: z.boolean().optional(),
    nullable: z.boolean().optional(),
    description: z.string().optional(),
  })
  .strict();

const enumLiteralSchema = z
  .object({
    id: z.string(),
    name: z.string(),
  })
  .strict();

const activationIntervalSchema = z
  .object({
    id: z.string(),
    fromEdgeId: z.string().optional(),
    toEdgeId: z.string().optional(),
    topPx: z.number().optional(),
    heightPx: z.number().optional(),
    topExtraPx: z.number().optional(),
    bottomExtraPx: z.number().optional(),
  })
  .strict();

const fragmentKindSchema = z.enum(["alt", "opt", "loop", "par", "break", "critical", "ref"]);

const fragmentOperandSchema = z
  .object({
    id: z.string(),
    guard: z.string().optional(),
    edges: z.array(z.string()),
  })
  .strict();

const combinedFragmentSchema = z
  .object({
    id: z.string(),
    kind: fragmentKindSchema,
    label: z.string().optional(),
    parentId: z.string().optional(),
    parentOperandId: z.string().optional(),
    operands: z.array(fragmentOperandSchema),
    coveredParticipants: z.array(z.string()).optional(),
    topExtraPx: z.number().int().optional(),
    bottomExtraPx: z.number().int().optional(),
  })
  .strict();

const sequenceNoteSchema = z
  .object({
    id: z.string(),
    placement: z.enum(["left", "right", "over"]),
    participants: z.array(z.string()),
    text: z.string(),
    anchorEdgeId: z.string().optional(),
  })
  .strict();

const sequenceDividerSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    afterEdgeId: z.string().optional(),
  })
  .strict();

const edgeEndpointSchema = z
  .object({
    role: z.string().optional(),
    multiplicity: z.string().optional(),
    navigability: z.enum(["navigable", "non-navigable", "unspecified"]).optional(),
  })
  .strict();

const nodeSchema = z
  .object({
    id: z.string(),
    kind: nodeKindSchema,
    label: z.string(),
    alias: z.string().optional(),
    stereotype: z.string().optional(),
    technology: z.string().optional(),
    description: z.string().optional(),
    attributes: z.array(attributeSchema).optional(),
    operations: z.array(operationSchema).optional(),
    generics: z.array(z.string()).optional(),
    enumLiterals: z.array(enumLiteralSchema).optional(),
    activations: z.array(activationIntervalSchema).optional(),
    style: nodeStyleSchema.optional(),
  })
  .strict();

const edgeSchema = z
  .object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
    kind: edgeKindSchema,
    label: z.string().optional(),
    technology: z.string().optional(),
    cardinality: z
      .object({
        source: z.string().optional(),
        target: z.string().optional(),
      })
      .strict()
      .optional(),
    ends: z
      .object({
        source: edgeEndpointSchema.optional(),
        target: edgeEndpointSchema.optional(),
      })
      .strict()
      .optional(),
    activatesTarget: z.boolean().optional(),
    deactivatesSource: z.boolean().optional(),
    style: edgeStyleSchema.optional(),
  })
  .strict();

const groupSchema = z
  .object({
    id: z.string(),
    kind: groupKindSchema,
    label: z.string(),
    alias: z.string().optional(),
    children: z.array(z.string()),
    description: z.string().optional(),
    style: nodeStyleSchema.optional(),
  })
  .strict();

const layoutCoordinateSchema = z
  .object({
    x: z.number(),
    y: z.number(),
  })
  .strict();

const metadataSchema = z
  .object({
    schemaVersion: z.string(),
    layoutOverrides: z.record(z.string(), layoutCoordinateSchema).optional(),
    opaque: z.array(z.string()).optional(),
    sequenceAutoNumber: z
      .object({
        start: z.number(),
        increment: z.number(),
        format: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/** Zod schema for the full `Diagram` AST. */
export const diagramSchema = z
  .object({
    id: z.string(),
    type: diagramTypeSchema,
    title: z.string().optional(),
    nodes: z.array(nodeSchema),
    edges: z.array(edgeSchema),
    groups: z.array(groupSchema),
    fragments: z.array(combinedFragmentSchema).optional(),
    notes: z.array(sequenceNoteSchema).optional(),
    dividers: z.array(sequenceDividerSchema).optional(),
    styles: z.record(z.string(), z.union([nodeStyleSchema, edgeStyleSchema])).optional(),
    metadata: metadataSchema,
  })
  .strict();

/** Successful parse outcome. */
export interface DiagramParseSuccess {
  ok: true;
  diagram: Diagram;
}

/** Failed parse outcome — `issues` mirrors the underlying `ZodError`. */
export interface DiagramParseFailure {
  ok: false;
  issues: z.ZodIssue[];
}

export type DiagramParseResult = DiagramParseSuccess | DiagramParseFailure;

/**
 * Runtime-validates an unknown value against the `Diagram` shape. Returns a
 * discriminated result so callers can branch without throwing.
 */
export function parseDiagram(value: unknown): DiagramParseResult {
  const result = diagramSchema.safeParse(value);
  if (result.success) {
    return { ok: true, diagram: result.data as Diagram };
  }
  return { ok: false, issues: result.error.issues };
}

/** Convenience: throws on failure, returns the typed diagram on success. */
export function parseDiagramOrThrow(value: unknown): Diagram {
  const result = parseDiagram(value);
  if (!result.ok) {
    const summary = result.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid diagram: ${summary}`);
  }
  return result.diagram;
}

/**
 * Returns true iff `value` matches the current `SCHEMA_VERSION`. Migrations
 * (when added) should branch on this; for now there is only one version.
 */
export function isCurrentSchemaVersion(version: string): boolean {
  return version === SCHEMA_VERSION;
}
