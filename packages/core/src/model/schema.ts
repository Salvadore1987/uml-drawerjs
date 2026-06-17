/**
 * Schema versioning and JSON Schema for `.umljson` documents.
 *
 * `SCHEMA_VERSION` is stamped into every newly-created `Diagram.metadata`.
 * Migrations between versions live in `migrations/` (added when needed).
 */

export const SCHEMA_VERSION = "0.1.0";

/**
 * JSON Schema (draft-2020-12) describing the on-disk `.umljson` shape. The
 * downstream documentation site, the CLI validator, and editor integrations
 * consume this directly.
 */
export const diagramJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://uml-drawer.dev/schemas/diagram.v1.json",
  title: "UML Drawer JS — Diagram",
  description: "Native `.umljson` document. Mirrors the in-memory AST 1:1.",
  type: "object",
  required: ["id", "type", "nodes", "edges", "groups", "metadata"],
  additionalProperties: false,
  properties: {
    id: { type: "string", description: "UUIDv7 of the diagram." },
    type: {
      enum: ["c4-context", "c4-container", "c4-component", "class", "er", "sequence"],
    },
    title: { type: "string" },
    nodes: { type: "array", items: { $ref: "#/$defs/node" } },
    edges: { type: "array", items: { $ref: "#/$defs/edge" } },
    groups: { type: "array", items: { $ref: "#/$defs/group" } },
    fragments: { type: "array", items: { $ref: "#/$defs/combinedFragment" } },
    notes: { type: "array", items: { $ref: "#/$defs/sequenceNote" } },
    dividers: { type: "array", items: { $ref: "#/$defs/sequenceDivider" } },
    styles: {
      type: "object",
      additionalProperties: { $ref: "#/$defs/styleEntry" },
    },
    metadata: { $ref: "#/$defs/metadata" },
  },
  $defs: {
    nodeKind: {
      enum: [
        "person",
        "system",
        "system-external",
        "container",
        "component",
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
      ],
    },
    edgeKind: {
      enum: [
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
      ],
    },
    visibility: { enum: ["public", "protected", "private", "package"] },
    arrowhead: {
      enum: ["none", "arrow", "open-arrow", "diamond", "open-diamond", "triangle", "open-triangle"],
    },
    nodeStyle: {
      type: "object",
      additionalProperties: false,
      properties: {
        fill: { type: "string" },
        stroke: { type: "string" },
        strokeWidth: { type: "number" },
        strokeDasharray: { type: "string" },
        textColor: { type: "string" },
        fontFamily: { type: "string" },
        fontSize: { type: "number" },
        borderRadius: { type: "number" },
      },
    },
    edgeStyle: {
      type: "object",
      additionalProperties: false,
      properties: {
        stroke: { type: "string" },
        strokeWidth: { type: "number" },
        strokeDasharray: { type: "string" },
        textColor: { type: "string" },
        fontFamily: { type: "string" },
        fontSize: { type: "number" },
        arrowStart: { $ref: "#/$defs/arrowhead" },
        arrowEnd: { $ref: "#/$defs/arrowhead" },
      },
    },
    styleEntry: {
      oneOf: [{ $ref: "#/$defs/nodeStyle" }, { $ref: "#/$defs/edgeStyle" }],
    },
    operationParameter: {
      type: "object",
      required: ["name"],
      additionalProperties: false,
      properties: {
        name: { type: "string" },
        type: { type: "string" },
        default: { type: "string" },
      },
    },
    operation: {
      type: "object",
      required: ["id", "name"],
      additionalProperties: false,
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        parameters: { type: "array", items: { $ref: "#/$defs/operationParameter" } },
        returnType: { type: "string" },
        visibility: { $ref: "#/$defs/visibility" },
        static: { type: "boolean" },
        abstract: { type: "boolean" },
        description: { type: "string" },
      },
    },
    attribute: {
      type: "object",
      required: ["id", "name"],
      additionalProperties: false,
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        type: { type: "string" },
        visibility: { $ref: "#/$defs/visibility" },
        multiplicity: { type: "string" },
        default: { type: "string" },
        readonly: { type: "boolean" },
        static: { type: "boolean" },
        primaryKey: { type: "boolean" },
        foreignKey: { type: "boolean" },
        nullable: { type: "boolean" },
        references: {
          type: "object",
          required: ["entity"],
          additionalProperties: false,
          properties: {
            entity: { type: "string" },
            column: { type: "string" },
          },
        },
        description: { type: "string" },
      },
    },
    enumLiteral: {
      type: "object",
      required: ["id", "name"],
      additionalProperties: false,
      properties: {
        id: { type: "string" },
        name: { type: "string" },
      },
    },
    activationInterval: {
      type: "object",
      required: ["id"],
      additionalProperties: false,
      properties: {
        id: { type: "string" },
        fromEdgeId: { type: "string" },
        toEdgeId: { type: "string" },
        topPx: { type: "number" },
        heightPx: { type: "number" },
        topExtraPx: { type: "number" },
        bottomExtraPx: { type: "number" },
      },
    },
    fragmentKind: {
      enum: ["alt", "opt", "loop", "par", "break", "critical", "ref"],
    },
    fragmentOperand: {
      type: "object",
      required: ["id", "edges"],
      additionalProperties: false,
      properties: {
        id: { type: "string" },
        guard: { type: "string" },
        edges: { type: "array", items: { type: "string" } },
      },
    },
    combinedFragment: {
      type: "object",
      required: ["id", "kind", "operands"],
      additionalProperties: false,
      properties: {
        id: { type: "string" },
        kind: { $ref: "#/$defs/fragmentKind" },
        label: { type: "string" },
        parentId: { type: "string" },
        parentOperandId: { type: "string" },
        operands: { type: "array", items: { $ref: "#/$defs/fragmentOperand" } },
        coveredParticipants: { type: "array", items: { type: "string" } },
        topExtraPx: { type: "integer" },
        bottomExtraPx: { type: "integer" },
      },
    },
    sequenceNote: {
      type: "object",
      required: ["id", "placement", "participants", "text"],
      additionalProperties: false,
      properties: {
        id: { type: "string" },
        placement: { enum: ["left", "right", "over"] },
        participants: { type: "array", items: { type: "string" } },
        text: { type: "string" },
        anchorEdgeId: { type: "string" },
      },
    },
    sequenceDivider: {
      type: "object",
      required: ["id", "label"],
      additionalProperties: false,
      properties: {
        id: { type: "string" },
        label: { type: "string" },
        afterEdgeId: { type: "string" },
      },
    },
    edgeEndpoint: {
      type: "object",
      additionalProperties: false,
      properties: {
        role: { type: "string" },
        multiplicity: { type: "string" },
        navigability: { enum: ["navigable", "non-navigable", "unspecified"] },
      },
    },
    node: {
      type: "object",
      required: ["id", "kind", "label"],
      additionalProperties: false,
      properties: {
        id: { type: "string" },
        kind: { $ref: "#/$defs/nodeKind" },
        label: { type: "string" },
        alias: { type: "string" },
        stereotype: { type: "string" },
        technology: { type: "string" },
        description: { type: "string" },
        attributes: { type: "array", items: { $ref: "#/$defs/attribute" } },
        operations: { type: "array", items: { $ref: "#/$defs/operation" } },
        enumLiterals: { type: "array", items: { $ref: "#/$defs/enumLiteral" } },
        activations: { type: "array", items: { $ref: "#/$defs/activationInterval" } },
        style: { $ref: "#/$defs/nodeStyle" },
      },
    },
    edge: {
      type: "object",
      required: ["id", "source", "target", "kind"],
      additionalProperties: false,
      properties: {
        id: { type: "string" },
        source: { type: "string" },
        target: { type: "string" },
        kind: { $ref: "#/$defs/edgeKind" },
        label: { type: "string" },
        technology: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        cardinality: {
          type: "object",
          additionalProperties: false,
          properties: {
            source: { type: "string" },
            target: { type: "string" },
          },
        },
        ends: {
          type: "object",
          additionalProperties: false,
          properties: {
            source: { $ref: "#/$defs/edgeEndpoint" },
            target: { $ref: "#/$defs/edgeEndpoint" },
          },
        },
        activatesTarget: { type: "boolean" },
        deactivatesSource: { type: "boolean" },
        style: { $ref: "#/$defs/edgeStyle" },
      },
    },
    group: {
      type: "object",
      required: ["id", "kind", "label", "children"],
      additionalProperties: false,
      properties: {
        id: { type: "string" },
        kind: { enum: ["boundary", "package", "system"] },
        label: { type: "string" },
        children: { type: "array", items: { type: "string" } },
        description: { type: "string" },
        style: { $ref: "#/$defs/nodeStyle" },
      },
    },
    metadata: {
      type: "object",
      required: ["schemaVersion"],
      additionalProperties: false,
      properties: {
        schemaVersion: { type: "string" },
        layoutOverrides: {
          type: "object",
          additionalProperties: {
            type: "object",
            required: ["x", "y"],
            additionalProperties: false,
            properties: {
              x: { type: "number" },
              y: { type: "number" },
            },
          },
        },
        opaque: { type: "array", items: { type: "string" } },
        sequenceAutoNumber: {
          type: "object",
          required: ["start", "increment"],
          additionalProperties: false,
          properties: {
            start: { type: "number" },
            increment: { type: "number" },
            format: { type: "string" },
          },
        },
      },
    },
  },
} as const;
