import type { DiagramType } from "./types.js";

/**
 * Type vocabularies suggested for attribute/column types, keyed by diagram
 * kind. The model treats `Attribute.type` as an opaque string — these lists
 * are *suggestions* (autocomplete, templates, lint hints), not a constraint
 * enforced by the parser or generator.
 *
 * - **ER diagrams** model a persistence schema, so they use the SQL
 *   vocabulary (`VARCHAR`, `INTEGER`, `TIMESTAMP`, …).
 * - **Class diagrams** model domain/code, so they use the Java vocabulary
 *   (`String`, `BigDecimal`, `LocalDateTime`, …).
 *
 * `UUID` intentionally appears in both.
 *
 * NOTE: the backend validation rule (`ErTypeFormatRule`, Java) keeps its own
 * copy of {@link SQL_TYPES}. Keep the two lists in sync — the canonical list
 * is documented in `docs/arch-vision.md` §10.
 */
export const SQL_TYPES: readonly string[] = [
  "VARCHAR",
  "CHAR",
  "TEXT",
  "BOOLEAN",
  "SMALLINT",
  "INTEGER",
  "BIGINT",
  "NUMERIC",
  "DECIMAL",
  "REAL",
  "DOUBLE PRECISION",
  "DATE",
  "TIME",
  "TIMESTAMP",
  "TIMESTAMPTZ",
  "UUID",
  "JSON",
  "JSONB",
  "BYTEA",
  "SERIAL",
  "BIGSERIAL",
];

export const JAVA_TYPES: readonly string[] = [
  "String",
  "Integer",
  "Long",
  "Short",
  "Byte",
  "Boolean",
  "Double",
  "Float",
  "BigDecimal",
  "BigInteger",
  "Character",
  "UUID",
  "LocalDate",
  "LocalTime",
  "LocalDateTime",
  "Instant",
  "OffsetDateTime",
  "Duration",
  "List",
  "Set",
  "Map",
];

/**
 * Suggested type vocabulary for a diagram kind. Returns an empty list for
 * diagram types that don't carry typed attributes (C4, sequence).
 */
export function typeSuggestionsFor(diagramType: DiagramType): readonly string[] {
  switch (diagramType) {
    case "er":
      return SQL_TYPES;
    case "class":
      return JAVA_TYPES;
    default:
      return [];
  }
}

/**
 * Normalises a raw attribute type string to the base type name used for
 * vocabulary checks: strips a leading PK/FK marker is the caller's job, but
 * this drops type parameters (`VARCHAR(255)` → `VARCHAR`,
 * `NUMERIC(19,4)` → `NUMERIC`) and trims surrounding whitespace. The result
 * is upper-cased for case-insensitive comparison against {@link SQL_TYPES}.
 */
export function baseTypeName(rawType: string): string {
  const withoutParams = rawType.split("(")[0] ?? rawType;
  return withoutParams.trim().toUpperCase();
}

/**
 * Whether a raw attribute type belongs to the SQL vocabulary (parameters
 * such as `VARCHAR(255)` are accepted — only the base name is checked,
 * case-insensitively).
 */
export function isSqlType(rawType: string): boolean {
  const base = baseTypeName(rawType);
  return SQL_TYPES.some((t) => t.toUpperCase() === base);
}
