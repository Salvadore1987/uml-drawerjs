import type { Attribute } from "../../model/types.js";
import type { ParseContext } from "../context.js";
import { freshId } from "../context.js";

/**
 * Entity-body grammar (PlantUML IE / UML-ER). Activated when the parser is
 * inside an `entity Foo { ... }` block (i.e. `ctx.openEntityStack` is
 * non-empty). Recognises attribute lines:
 *
 *   - `* id : UUID`              → primaryKey, nullable=false
 *   - `+ tenant_id : UUID`       → foreignKey
 *   - `email : String <<NN>>`    → nullable=false
 *   - `name : String`            → nullable (default)
 *   - `name : String = "default"`→ default captured
 *
 * PK implies NN; the `<<NN>>` marker is suppressed when PK is set.
 */

const PK_PREFIX = /^\*\s*/u;
const FK_PREFIX = /^\+\s*/u;
const NN_TAIL = /\s+<<\s*(?:NN|not\s+null)\s*>>\s*$/iu;
const FIELD_LINE = /^([A-Za-z_][\w]*)\s*(?::\s*([^=]+?))?\s*(?:=\s*(.+))?\s*$/u;

export function handleEntityMember(ctx: ParseContext, rawText: string): boolean {
  const frame = ctx.openEntityStack[ctx.openEntityStack.length - 1];
  if (!frame) return false;

  const text = rawText.trim();
  if (text === "" || text === "}") return false;

  const node = ctx.nodes.find((n) => n.id === frame.nodeId);
  if (!node) return false;

  // Strip a trailing `;` separator if used.
  const body = text.replace(/;$/u, "").trimEnd();

  const attribute = parseEntityAttribute(ctx, body);
  if (attribute) {
    (node.attributes ??= []).push(attribute);
    return true;
  }

  return false;
}

function parseEntityAttribute(ctx: ParseContext, text: string): Attribute | null {
  let rest = text;
  let primaryKey = false;
  let foreignKey = false;
  let nullable: boolean | undefined;

  // 1. Trailing `<<NN>>` / `<<not null>>` marker — strip first so it doesn't
  //    interfere with the field grammar.
  const nnMatch = NN_TAIL.exec(rest);
  if (nnMatch) {
    nullable = false;
    rest = rest.slice(0, nnMatch.index).trimEnd();
  }

  // 2. PK marker `*` (PlantUML IE primary key). Implies NN.
  const pkMatch = PK_PREFIX.exec(rest);
  if (pkMatch) {
    primaryKey = true;
    nullable = false;
    rest = rest.slice(pkMatch[0].length);
  }

  // 3. FK marker `+`. Independent of PK.
  const fkMatch = FK_PREFIX.exec(rest);
  if (fkMatch) {
    foreignKey = true;
    rest = rest.slice(fkMatch[0].length);
  }

  const match = FIELD_LINE.exec(rest);
  if (!match) return null;
  const name = match[1];
  const type = match[2]?.trim();
  const def = match[3]?.trim();
  if (!name) return null;

  const attr: Attribute = { id: freshId(ctx), name };
  if (type) attr.type = type;
  if (def !== undefined && def !== "") attr.default = def;
  if (primaryKey) attr.primaryKey = true;
  if (foreignKey) attr.foreignKey = true;
  if (nullable === false) attr.nullable = false;
  return attr;
}
