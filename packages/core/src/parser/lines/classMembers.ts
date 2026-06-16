import type {
  Attribute,
  EnumLiteral,
  Operation,
  OperationParameter,
  Visibility,
} from "../../model/types.js";
import type { ParseContext } from "../context.js";
import { freshId } from "../context.js";

/**
 * Class member-block grammar. Activated when the parser is inside a `{ ... }`
 * body (i.e. `ctx.openClassStack` is non-empty). Recognises three line shapes:
 *
 *   - field:   `[+#-~]?  ({static}|{readonly})*  name (: Type)? (= default)?`
 *   - method:  `[+#-~]?  ({abstract}|{static})*  name(params) (: ReturnType)?`
 *   - literal: bare IDENT (only when the open frame's kind === "enum")
 *
 * Unparseable lines fall through to the opaque bucket so authors don't lose
 * unsupported PlantUML constructs.
 */

const VISIBILITY_BY_PREFIX: Record<string, Visibility> = {
  "+": "public",
  "-": "private",
  "#": "protected",
  "~": "package",
};

const VIS_PREFIX = /^([+\-#~])\s*/u;
const FIELD_MODIFIER_BLOCK = /^(?:\{(static|readonly)\}\s*)+/iu;
const METHOD_MODIFIER_BLOCK = /^(?:\{(static|abstract)\}\s*)+/iu;
const FIELD_MODIFIER = /\{(static|readonly)\}/giu;
const METHOD_MODIFIER = /\{(static|abstract)\}/giu;
const TRAILING_MODIFIER = /\s+\{\s*(static|readonly|abstract)\s*\}\s*$/iu;
const TRAILING_MULTIPLICITY = /\[([^[\]]+)\]\s*$/u;

/** A bare identifier — matches enum literal lines. */
const BARE_IDENT = /^([A-Za-z_][\w]*)$/u;

/** Method signature: name(params) (: ReturnType)? */
const METHOD_LINE = /^([A-Za-z_][\w]*)\s*\(([^)]*)\)\s*(?::\s*(.+?))?\s*$/u;

/** Field: name (: Type)? (= default)? */
const FIELD_LINE = /^([A-Za-z_][\w]*)\s*(?::\s*([^=]+?))?\s*(?:=\s*(.+))?\s*$/u;

export function handleClassMember(ctx: ParseContext, rawText: string): boolean {
  const frame = ctx.openClassStack[ctx.openClassStack.length - 1];
  if (!frame) return false;

  const text = rawText.trim();
  if (text === "" || text === "}") return false;

  const node = ctx.nodes.find((n) => n.id === frame.nodeId);
  if (!node) return false;

  if (frame.kind === "enum") {
    const literal = parseEnumLiteral(ctx, text);
    if (literal) {
      (node.enumLiterals ??= []).push(literal);
      return true;
    }
  }

  // Strip a trailing `;` separator if PlantUML authors used it.
  const body = text.replace(/;$/u, "").trimEnd();

  const operation = parseOperation(ctx, body);
  if (operation) {
    (node.operations ??= []).push(operation);
    return true;
  }

  const attribute = parseAttribute(ctx, body);
  if (attribute) {
    (node.attributes ??= []).push(attribute);
    return true;
  }

  return false;
}

function parseEnumLiteral(ctx: ParseContext, text: string): EnumLiteral | null {
  const match = BARE_IDENT.exec(text);
  if (!match) return null;
  return { id: freshId(ctx), name: match[1] ?? text };
}

function parseOperation(ctx: ParseContext, text: string): Operation | null {
  let rest = text;

  // Modifier block and visibility may appear in either order:
  //   `+ {abstract} foo()` and `{abstract} + foo()` are both valid in PlantUML.
  let visibility = takeVisibility(rest);
  rest = visibility.rest;

  const modifiers = takeMethodModifiers(rest);
  rest = modifiers.rest;

  // If visibility hadn't been seen yet, try again after the modifier block.
  if (!visibility.value) {
    const second = takeVisibility(rest);
    if (second.value) {
      visibility = second;
      rest = second.rest;
    }
  }

  // Trailing `{abstract}` / `{static}` (PlantUML accepts either side).
  const trailing = takeTrailingModifier(rest);
  rest = trailing.rest;
  if (trailing.modifier === "abstract") modifiers.abstract = true;
  if (trailing.modifier === "static") modifiers.static = true;

  const match = METHOD_LINE.exec(rest);
  if (!match) return null;
  const name = match[1];
  const paramList = match[2] ?? "";
  const returnType = match[3]?.trim();
  if (!name) return null;

  const op: Operation = { id: freshId(ctx), name };
  if (visibility.value) op.visibility = visibility.value;
  if (modifiers.static) op.static = true;
  if (modifiers.abstract) op.abstract = true;
  const params = parseParameters(paramList);
  if (params.length > 0) op.parameters = params;
  if (returnType) op.returnType = returnType;
  return op;
}

function parseAttribute(ctx: ParseContext, text: string): Attribute | null {
  let rest = text;

  let visibility = takeVisibility(rest);
  rest = visibility.rest;

  const modifiers = takeFieldModifiers(rest);
  rest = modifiers.rest;

  if (!visibility.value) {
    const second = takeVisibility(rest);
    if (second.value) {
      visibility = second;
      rest = second.rest;
    }
  }

  const trailing = takeTrailingModifier(rest);
  rest = trailing.rest;
  if (trailing.modifier === "static") modifiers.static = true;
  if (trailing.modifier === "readonly") modifiers.readonly = true;

  const match = FIELD_LINE.exec(rest);
  if (!match) return null;
  const name = match[1];
  let type = match[2]?.trim();
  const def = match[3]?.trim();
  if (!name) return null;

  // Multiplicity `[0..*]` is allowed on the trailing edge of the type token
  // (`+items: Item [0..*]`). Strip it from the type so renderer can show it
  // separately. Also accept multiplicity on a bare line with no default.
  let multiplicity: string | undefined;
  if (type) {
    const m = TRAILING_MULTIPLICITY.exec(type);
    if (m) {
      multiplicity = m[1]?.trim();
      type = type.slice(0, m.index).trimEnd();
    }
  }

  const attr: Attribute = { id: freshId(ctx), name };
  if (visibility.value) attr.visibility = visibility.value;
  if (modifiers.static) attr.static = true;
  if (modifiers.readonly) attr.readonly = true;
  if (type) attr.type = type;
  if (multiplicity) attr.multiplicity = multiplicity;
  if (def !== undefined && def !== "") attr.default = def;
  return attr;
}

function takeVisibility(text: string): { rest: string; value: Visibility | undefined } {
  const match = VIS_PREFIX.exec(text);
  if (!match) return { rest: text, value: undefined };
  const sigil = match[1] ?? "";
  return { rest: text.slice(match[0].length), value: VISIBILITY_BY_PREFIX[sigil] };
}

function takeMethodModifiers(text: string): {
  rest: string;
  static: boolean;
  abstract: boolean;
} {
  const block = METHOD_MODIFIER_BLOCK.exec(text);
  if (!block) return { rest: text, static: false, abstract: false };
  const flags = { static: false, abstract: false };
  block[0].replace(METHOD_MODIFIER, (_full, mod) => {
    if (mod === "static") flags.static = true;
    if (mod === "abstract") flags.abstract = true;
    return "";
  });
  return { rest: text.slice(block[0].length), ...flags };
}

function takeFieldModifiers(text: string): {
  rest: string;
  static: boolean;
  readonly: boolean;
} {
  const block = FIELD_MODIFIER_BLOCK.exec(text);
  if (!block) return { rest: text, static: false, readonly: false };
  const flags = { static: false, readonly: false };
  block[0].replace(FIELD_MODIFIER, (_full, mod) => {
    if (mod === "static") flags.static = true;
    if (mod === "readonly") flags.readonly = true;
    return "";
  });
  return { rest: text.slice(block[0].length), ...flags };
}

function takeTrailingModifier(text: string): {
  rest: string;
  modifier: "static" | "readonly" | "abstract" | undefined;
} {
  const match = TRAILING_MODIFIER.exec(text);
  if (!match) return { rest: text, modifier: undefined };
  return {
    rest: text.slice(0, match.index),
    modifier: match[1] as "static" | "readonly" | "abstract",
  };
}

function parseParameters(list: string): OperationParameter[] {
  const text = list.trim();
  if (text === "") return [];
  // Naïve split on `,` — generic types in parameters (`List<String>`) are
  // tracked at the type-string level, never split.
  const parts: string[] = [];
  let depth = 0;
  let buffer = "";
  for (const ch of text) {
    if (ch === "<" || ch === "(") depth++;
    else if (ch === ">" || ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(buffer);
      buffer = "";
      continue;
    }
    buffer += ch;
  }
  if (buffer.trim() !== "") parts.push(buffer);

  const params: OperationParameter[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed === "") continue;
    // `name: Type = default` — also accept bare `name` and `name = default`.
    const m = /^([A-Za-z_][\w]*)\s*(?::\s*([^=]+?))?\s*(?:=\s*(.+))?\s*$/u.exec(trimmed) ?? null;
    if (!m) continue;
    const name = m[1];
    const type = m[2]?.trim();
    const def = m[3]?.trim();
    if (!name) continue;
    const param: OperationParameter = { name };
    if (type) param.type = type;
    if (def !== undefined && def !== "") param.default = def;
    params.push(param);
  }
  return params;
}
