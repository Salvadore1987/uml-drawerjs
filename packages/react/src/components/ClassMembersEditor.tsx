import { updateNodeCommand } from "@uml-drawer/core/commands";
import type {
  Attribute,
  DiagramNode,
  EnumLiteral,
  NodeKind,
  Operation,
  OperationParameter,
  Visibility,
} from "@uml-drawer/core/model";
import { uuidv7 } from "@uml-drawer/core/model";
import { useContext, useMemo } from "react";
import { UmlEditorContext } from "../internal/context.js";
import { useEditorState } from "../hooks/useEditorState.js";

/**
 * Inline editor for class-diagram member fields — attributes, operations,
 * enum literals, generic type parameters. Embedded inside the PropsPanel
 * when a class / interface / abstract-class / enum node is selected.
 *
 * Each row commits its patch to the bus immediately on change. The form
 * stays bound to the node's actual AST shape, so external edits (e.g. text
 * editor → parser → updateNodeCommand) reflect live without local state
 * drift.
 *
 * Note on `exactOptionalPropertyTypes`: optional fields can't be assigned
 * `undefined` directly. To clear them, the helpers omit the key entirely
 * via destructure-rest (`omit(...)`) instead of spreading `undefined`.
 */
export interface ClassMembersEditorProps {
  readonly node: DiagramNode;
}

const VISIBILITY_OPTIONS: { value: Visibility; sigil: string; label: string }[] = [
  { value: "public", sigil: "+", label: "+ public" },
  { value: "protected", sigil: "#", label: "# protected" },
  { value: "private", sigil: "-", label: "− private" },
  { value: "package", sigil: "~", label: "~ package" },
];

/**
 * Built-in primitive types offered in the type-select dropdowns. Names use
 * UML's neutral spellings (`Integer`, `Decimal`, `Boolean`) rather than a
 * specific language's conventions, so the dropdown reads correctly across
 * Java / Kotlin / Swift / TS modelling contexts.
 */
const PRIMITIVE_TYPES = [
  "void",
  "String",
  "Integer",
  "Boolean",
  "Decimal",
  "Long",
  "Float",
  "Double",
  "Date",
  "UUID",
  "Object",
] as const;

/**
 * Generic container types whose type arguments are filled via dedicated
 * fields in `TypeField`. `params` lists the argument slots; each name doubles
 * as the empty-option placeholder ("element", "key", "value").
 */
interface GenericBase {
  readonly base: string;
  readonly params: readonly string[];
}
const GENERIC_BASES: readonly GenericBase[] = [
  { base: "List", params: ["element"] },
  { base: "Set", params: ["element"] },
  { base: "Collection", params: ["element"] },
  { base: "Map", params: ["key", "value"] },
];
const GENERIC_BASE_NAMES = GENERIC_BASES.map((g) => g.base);
function genericDef(base: string): GenericBase | undefined {
  return GENERIC_BASES.find((g) => g.base === base);
}

const CLASS_LIKE_KINDS = new Set<NodeKind>(["class", "interface", "abstract-class", "enum"]);

/**
 * Type option catalog for the member type selects:
 *  - `baseOptions`: primitives + generic container bases + class-like node
 *    labels — shown in the top-level type select.
 *  - `argOptions`: primitives + class-like labels — shown in the per-argument
 *    selects of a generic type (no nested generics in this version).
 * Sorted, deduplicated, recomputed on AST change.
 */
function useTypeCatalog(): { baseOptions: string[]; argOptions: string[] } {
  const { ast } = useEditorState();
  return useMemo(() => {
    const labels = ast.nodes
      .filter((n) => CLASS_LIKE_KINDS.has(n.kind) && n.label.trim() !== "")
      .map((n) => n.label.trim());
    const argOptions = [...new Set<string>([...PRIMITIVE_TYPES, ...labels])].sort((a, b) =>
      a.localeCompare(b),
    );
    const baseOptions = [
      ...new Set<string>([...PRIMITIVE_TYPES, ...GENERIC_BASE_NAMES, ...labels]),
    ].sort((a, b) => a.localeCompare(b));
    return { baseOptions, argOptions };
  }, [ast]);
}

/** Split a generic arg list on top-level commas (depth-aware for nested `<…>`). */
function splitTypeArgs(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let buffer = "";
  for (const ch of text) {
    if (ch === "<") depth++;
    else if (ch === ">") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(buffer);
      buffer = "";
      continue;
    }
    buffer += ch;
  }
  parts.push(buffer);
  return parts.map((p) => p.trim());
}

/** Decompose `Map<String, Integer>` → `{ base, args }` for a known generic base. */
function parseGenericType(type: string): { base: string; args: string[] } | null {
  const trimmed = type.trim();
  const match = /^([A-Za-z_]\w*)\s*<(.*)>\s*$/u.exec(trimmed);
  if (match && genericDef(match[1] ?? "")) {
    const inner = (match[2] ?? "").trim();
    return { base: match[1]!, args: inner === "" ? [] : splitTypeArgs(inner) };
  }
  if (genericDef(trimmed)) return { base: trimmed, args: [] };
  return null;
}

/** Compose a type string from a base and its args (trailing empty slots dropped). */
function composeGenericType(base: string, args: readonly string[]): string {
  const slots = [...args];
  while (slots.length > 0 && (slots[slots.length - 1] ?? "").trim() === "") slots.pop();
  if (slots.length === 0) return base;
  return `${base}<${slots.map((a) => a.trim()).join(", ")}>`;
}

/**
 * Type selector for attribute / return / parameter types. A primitive or
 * class label is stored verbatim; choosing a generic container (List/Map/…)
 * reveals one select per type argument and stores the composed string
 * (e.g. `Map<String, Integer>`). The `—` option clears the type.
 */
interface TypeFieldProps {
  readonly label: string;
  readonly value: string | undefined;
  readonly onChange: (next: string | undefined) => void;
}
function TypeField({ label, value, onChange }: TypeFieldProps): JSX.Element {
  const { baseOptions, argOptions } = useTypeCatalog();
  const parsed = parseGenericType(value ?? "");
  const base = parsed ? parsed.base : (value ?? "");
  const def = genericDef(base);
  const args = parsed?.args ?? [];
  return (
    <span className="uml-class-members__type">
      <select
        aria-label={label}
        value={base}
        onChange={(e): void => {
          const next = e.target.value;
          if (next === "") {
            onChange(undefined);
            return;
          }
          onChange(genericDef(next) ? composeGenericType(next, []) : next);
        }}
      >
        <option value="">—</option>
        {baseOptions.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      {def?.params.map((paramName, i) => (
        <select
          key={paramName}
          aria-label={`${label} ${paramName}`}
          value={args[i] ?? ""}
          onChange={(e): void => {
            const nextArgs = def.params.map((_, j) => (j === i ? e.target.value : (args[j] ?? "")));
            onChange(composeGenericType(base, nextArgs));
          }}
        >
          <option value="">{paramName}</option>
          {argOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      ))}
    </span>
  );
}

export function ClassMembersEditor({ node }: ClassMembersEditorProps): JSX.Element {
  const ctx = useContext(UmlEditorContext);
  const editor = ctx?.editor ?? null;

  const isClass = node.kind === "class" || node.kind === "abstract-class";
  const isInterface = node.kind === "interface";
  const isEnum = node.kind === "enum";
  const isClassLike = isClass || isInterface || isEnum;
  if (!isClassLike) return <></>;

  const setNode = (patch: (prev: DiagramNode) => DiagramNode): void => {
    if (!editor) return;
    const next = patch(node);
    // Compute a "dispatchable" diff: only the keys that changed. We pass the
    // entire post-image and let the command rebuild the node — simpler than
    // computing per-field deltas, and the command bus already replaces the
    // node atomically.
    editor.dispatch(updateNodeCommand(node.id, nodePatchFrom(node, next), editor.getState()));
  };

  return (
    <div className="uml-class-members">
      {isEnum ? (
        <EnumLiteralsSection
          literals={node.enumLiterals ?? []}
          onChange={(next): void =>
            setNode((prev) =>
              next.length > 0 ? { ...prev, enumLiterals: next } : omit(prev, "enumLiterals"),
            )
          }
        />
      ) : (
        <>
          <AttributesSection
            attributes={node.attributes ?? []}
            onChange={(next): void =>
              setNode((prev) =>
                next.length > 0 ? { ...prev, attributes: next } : omit(prev, "attributes"),
              )
            }
          />
          <OperationsSection
            operations={node.operations ?? []}
            interfaceImpliedAbstract={isInterface}
            onChange={(next): void =>
              setNode((prev) =>
                next.length > 0 ? { ...prev, operations: next } : omit(prev, "operations"),
              )
            }
          />
        </>
      )}
    </div>
  );
}

/* ---------------------------- Attributes ---------------------------- */

interface AttributesSectionProps {
  readonly attributes: Attribute[];
  readonly onChange: (next: Attribute[]) => void;
}

function AttributesSection({ attributes, onChange }: AttributesSectionProps): JSX.Element {
  const replace = (index: number, transform: (prev: Attribute) => Attribute): void => {
    onChange(attributes.map((attr, i) => (i === index ? transform(attr) : attr)));
  };
  const remove = (index: number): void => {
    onChange(attributes.filter((_, i) => i !== index));
  };
  const add = (): void => {
    const fresh: Attribute = { id: uuidv7(), name: "field", visibility: "public" };
    onChange([...attributes, fresh]);
  };

  return (
    <section className="uml-class-members__section">
      <header className="uml-class-members__heading">Attributes</header>
      {attributes.length === 0 ? (
        <p className="uml-class-members__empty">No attributes yet.</p>
      ) : (
        <ul className="uml-class-members__list">
          {attributes.map((attr, index) => (
            <li key={attr.id} className="uml-class-members__row">
              <select
                aria-label="Visibility"
                value={attr.visibility ?? "public"}
                onChange={(e): void =>
                  replace(index, (prev) => ({ ...prev, visibility: e.target.value as Visibility }))
                }
                className="uml-class-members__visibility"
              >
                {VISIBILITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.sigil}
                  </option>
                ))}
              </select>
              <input
                type="text"
                aria-label="Attribute name"
                placeholder="name"
                value={attr.name}
                onChange={(e): void =>
                  replace(index, (prev) => ({ ...prev, name: e.target.value }))
                }
                className="uml-class-members__name"
              />
              <span className="uml-class-members__sep">:</span>
              <TypeField
                label="Attribute type"
                value={attr.type}
                onChange={(next): void =>
                  replace(index, (prev) =>
                    next === undefined ? omit(prev, "type") : { ...prev, type: next },
                  )
                }
              />
              <label className="uml-class-members__flag" title="Static (rendered with underline)">
                <input
                  type="checkbox"
                  checked={attr.static === true}
                  onChange={(e): void =>
                    replace(index, (prev) =>
                      e.target.checked ? { ...prev, static: true } : omit(prev, "static"),
                    )
                  }
                />
                <span>static</span>
              </label>
              <label
                className="uml-class-members__flag"
                title="Read-only (rendered with {readonly} suffix)"
              >
                <input
                  type="checkbox"
                  checked={attr.readonly === true}
                  onChange={(e): void =>
                    replace(index, (prev) =>
                      e.target.checked ? { ...prev, readonly: true } : omit(prev, "readonly"),
                    )
                  }
                />
                <span>readonly</span>
              </label>
              <button
                type="button"
                aria-label="Remove attribute"
                className="uml-class-members__remove"
                onClick={(): void => remove(index)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="uml-button uml-class-members__add" onClick={add}>
        + Add attribute
      </button>
    </section>
  );
}

/* ---------------------------- Operations ---------------------------- */

interface OperationsSectionProps {
  readonly operations: Operation[];
  readonly interfaceImpliedAbstract: boolean;
  readonly onChange: (next: Operation[]) => void;
}

function OperationsSection({
  operations,
  interfaceImpliedAbstract,
  onChange,
}: OperationsSectionProps): JSX.Element {
  const replace = (index: number, transform: (prev: Operation) => Operation): void => {
    onChange(operations.map((op, i) => (i === index ? transform(op) : op)));
  };
  const remove = (index: number): void => {
    onChange(operations.filter((_, i) => i !== index));
  };
  const add = (): void => {
    const fresh: Operation = { id: uuidv7(), name: "method", visibility: "public" };
    if (interfaceImpliedAbstract) fresh.abstract = true;
    onChange([...operations, fresh]);
  };
  const updateParam = (
    opIndex: number,
    pIndex: number,
    transform: (prev: OperationParameter) => OperationParameter,
  ): void => {
    replace(opIndex, (op) => {
      const params = (op.parameters ?? []).map((p, i) => (i === pIndex ? transform(p) : p));
      return { ...op, parameters: params };
    });
  };
  const removeParam = (opIndex: number, pIndex: number): void => {
    replace(opIndex, (op) => {
      const next = (op.parameters ?? []).filter((_, i) => i !== pIndex);
      return next.length > 0 ? { ...op, parameters: next } : omit(op, "parameters");
    });
  };
  const addParam = (opIndex: number): void => {
    replace(opIndex, (op) => ({
      ...op,
      parameters: [...(op.parameters ?? []), { name: "param" }],
    }));
  };

  return (
    <section className="uml-class-members__section">
      <header className="uml-class-members__heading">Operations</header>
      {operations.length === 0 ? (
        <p className="uml-class-members__empty">No operations yet.</p>
      ) : (
        <ul className="uml-class-members__list">
          {operations.map((op, index) => (
            <li key={op.id} className="uml-class-members__row uml-class-members__row--operation">
              <div className="uml-class-members__op-header">
                <select
                  aria-label="Visibility"
                  value={op.visibility ?? "public"}
                  onChange={(e): void =>
                    replace(index, (prev) => ({
                      ...prev,
                      visibility: e.target.value as Visibility,
                    }))
                  }
                  className="uml-class-members__visibility"
                >
                  {VISIBILITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.sigil}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  aria-label="Operation name"
                  placeholder="method"
                  value={op.name}
                  onChange={(e): void =>
                    replace(index, (prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="uml-class-members__name"
                />
                <span className="uml-class-members__sep">:</span>
                <TypeField
                  label="Return type"
                  value={op.returnType}
                  onChange={(next): void =>
                    replace(index, (prev) =>
                      next === undefined ? omit(prev, "returnType") : { ...prev, returnType: next },
                    )
                  }
                />
                <button
                  type="button"
                  aria-label="Remove operation"
                  className="uml-class-members__remove"
                  onClick={(): void => remove(index)}
                >
                  ✕
                </button>
              </div>
              <div className="uml-class-members__params-list">
                {(op.parameters ?? []).map((param, pIndex) => (
                  <div key={pIndex} className="uml-class-members__param-row">
                    <input
                      type="text"
                      aria-label="Parameter name"
                      placeholder="name"
                      value={param.name}
                      onChange={(e): void =>
                        updateParam(index, pIndex, (prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                    />
                    <span className="uml-class-members__sep">:</span>
                    <TypeField
                      label="Parameter type"
                      value={param.type}
                      onChange={(next): void =>
                        updateParam(index, pIndex, (prev) =>
                          next === undefined ? omit(prev, "type") : { ...prev, type: next },
                        )
                      }
                    />
                    <input
                      type="text"
                      aria-label="Default value"
                      placeholder="default"
                      value={param.default ?? ""}
                      onChange={(e): void =>
                        updateParam(index, pIndex, (prev) =>
                          e.target.value === ""
                            ? omit(prev, "default")
                            : { ...prev, default: e.target.value },
                        )
                      }
                    />
                    <button
                      type="button"
                      aria-label="Remove parameter"
                      className="uml-class-members__remove"
                      onClick={(): void => removeParam(index, pIndex)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="uml-button uml-class-members__add"
                  onClick={(): void => addParam(index)}
                >
                  + Add parameter
                </button>
              </div>
              <div className="uml-class-members__op-flags">
                <label
                  className="uml-class-members__flag"
                  title={
                    interfaceImpliedAbstract
                      ? "Interface methods are always abstract"
                      : "Abstract (rendered in italic)"
                  }
                >
                  <input
                    type="checkbox"
                    checked={op.abstract === true}
                    disabled={interfaceImpliedAbstract}
                    onChange={(e): void =>
                      replace(index, (prev) =>
                        e.target.checked ? { ...prev, abstract: true } : omit(prev, "abstract"),
                      )
                    }
                  />
                  <span>abstract</span>
                </label>
                <label className="uml-class-members__flag" title="Static (rendered with underline)">
                  <input
                    type="checkbox"
                    checked={op.static === true}
                    onChange={(e): void =>
                      replace(index, (prev) =>
                        e.target.checked ? { ...prev, static: true } : omit(prev, "static"),
                      )
                    }
                  />
                  <span>static</span>
                </label>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="uml-button uml-class-members__add" onClick={add}>
        + Add operation
      </button>
    </section>
  );
}

/* --------------------------- Enum literals -------------------------- */

interface EnumLiteralsSectionProps {
  readonly literals: EnumLiteral[];
  readonly onChange: (next: EnumLiteral[]) => void;
}

function EnumLiteralsSection({ literals, onChange }: EnumLiteralsSectionProps): JSX.Element {
  const replace = (index: number, transform: (prev: EnumLiteral) => EnumLiteral): void => {
    onChange(literals.map((l, i) => (i === index ? transform(l) : l)));
  };
  const remove = (index: number): void => {
    onChange(literals.filter((_, i) => i !== index));
  };
  const add = (): void => {
    onChange([...literals, { id: uuidv7(), name: "VALUE" }]);
  };

  return (
    <section className="uml-class-members__section">
      <header className="uml-class-members__heading">Literals</header>
      {literals.length === 0 ? (
        <p className="uml-class-members__empty">No literals yet.</p>
      ) : (
        <ul className="uml-class-members__list">
          {literals.map((literal, index) => (
            <li key={literal.id} className="uml-class-members__row">
              <input
                type="text"
                aria-label="Literal name"
                placeholder="VALUE"
                value={literal.name}
                onChange={(e): void =>
                  replace(index, (prev) => ({ ...prev, name: e.target.value }))
                }
                className="uml-class-members__name"
              />
              <button
                type="button"
                aria-label="Remove literal"
                className="uml-class-members__remove"
                onClick={(): void => remove(index)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="uml-button uml-class-members__add" onClick={add}>
        + Add literal
      </button>
    </section>
  );
}

/* ----------------------------- helpers ------------------------------ */

/**
 * Type-safe destructure-rest. Returns a copy of `obj` with `key` removed —
 * the only way to "clear" an optional property under
 * `exactOptionalPropertyTypes: true` (assigning `undefined` is rejected).
 */
function omit<T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  const { [key]: _removed, ...rest } = obj;
  void _removed;
  return rest;
}

/**
 * Build a `Partial<DiagramNode>` containing only the keys whose values
 * differ between `before` and `after`. Keys removed in `after` are
 * represented as the dropped key (the command bus replaces the node, so
 * the "absent" semantics carry through naturally — but we guard against
 * sending no-op patches that would still trigger a re-render).
 */
function nodePatchFrom(before: DiagramNode, after: DiagramNode): Partial<DiagramNode> {
  const patch: Partial<DiagramNode> = {};
  for (const key of NODE_PATCHABLE_KEYS) {
    if (before[key] !== after[key]) {
      // Cast through unknown — the keys are the same union, just narrowed.
      (patch as Record<string, unknown>)[key] = after[key];
    }
  }
  return patch;
}

const NODE_PATCHABLE_KEYS = [
  "attributes",
  "operations",
  "enumLiterals",
] as const satisfies ReadonlyArray<keyof DiagramNode>;
