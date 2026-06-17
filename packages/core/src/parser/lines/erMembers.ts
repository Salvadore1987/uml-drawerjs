import type { Attribute } from "../../model/types.js";
import type { ParseContext } from "../context.js";
import { freshId, resolveAlias } from "../context.js";

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
/** Any trailing `<<...>>` stereotype (NN / not null / FK target). */
const STEREO_TAIL = /\s*<<\s*([^>]*?)\s*>>\s*$/u;
const NN_INNER = /^(?:NN|not\s+null)$/iu;
const FK_INNER = /^FK\s+([^.\s]+)(?:\.([^.\s]+))?$/iu;
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
  let references: Attribute["references"];

  // 1. Trailing `<<...>>` stereotypes — strip from the end so they don't
  //    interfere with the field grammar. The generator emits `<<NN>>` then
  //    `<<FK target>>`, so loop to consume every trailing token regardless of
  //    order. `NN` → not-null; `FK alias[.col]` → references.
  for (;;) {
    const tail = STEREO_TAIL.exec(rest);
    if (!tail) break;
    const inner = tail[1]?.trim() ?? "";
    if (NN_INNER.test(inner)) {
      nullable = false;
    } else {
      const fk = FK_INNER.exec(inner);
      if (fk) {
        const entity = resolveAlias(ctx, fk[1]!, "create")!;
        references = fk[2] ? { entity, column: fk[2] } : { entity };
        foreignKey = true;
      } else {
        break; // unknown stereotype — leave it for the field grammar / opaque
      }
    }
    rest = rest.slice(0, tail.index).trimEnd();
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
  if (references) attr.references = references;
  return attr;
}
