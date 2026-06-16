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
 * Generic collection types offered as ready-made templates in the type
 * selects. The placeholder parameters (`E`, `K`, `V`) follow the JDK
 * conventions; authors refine them to concrete element types in the source
 * editor when needed.
 */
const COLLECTION_TYPES = ["List<E>", "Map<K,V>", "Set<E>", "Collection<E>"] as const;

const CLASS_LIKE_KINDS = new Set<NodeKind>(["class", "interface", "abstract-class", "enum"]);

/**
 * Live list of types eligible for attribute / return-type / parameter
 * selects: built-in primitives plus every class-like node label currently
 * in the diagram. Sorted, deduplicated, recomputed on AST change.
 */
function useTypeOptions(): string[] {
  const { ast } = useEditorState();
  return useMemo(() => {
    const labels = ast.nodes
      .filter((n) => CLASS_LIKE_KINDS.has(n.kind) && n.label.trim() !== "")
      .map((n) => n.label.trim());
    const merged = new Set<string>([...PRIMITIVE_TYPES, ...COLLECTION_TYPES, ...labels]);
    return [...merged].sort((a, b) => a.localeCompare(b));
  }, [ast]);
}

export function ClassMembersEditor({ node }: ClassMembersEditorProps): JSX.Element {
  const ctx = useContext(UmlEditorContext);
  const editor = ctx?.editor ?? null;
  const types = useTypeOptions();

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
      {!isEnum && (
        <ClassGenericsEditor
          generics={node.generics ?? []}
          onChange={(next): void =>
            setNode((prev) =>
              next.length > 0 ? { ...prev, generics: next } : omit(prev, "generics"),
            )
          }
        />
      )}

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
            types={types}
            onChange={(next): void =>
              setNode((prev) =>
                next.length > 0 ? { ...prev, attributes: next } : omit(prev, "attributes"),
              )
            }
          />
          <OperationsSection
            operations={node.operations ?? []}
            interfaceImpliedAbstract={isInterface}
            types={types}
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

/* ----------------------------- Generics ----------------------------- */

interface ClassGenericsEditorProps {
  readonly generics: string[];
  readonly onChange: (next: string[]) => void;
}

function ClassGenericsEditor({ generics, onChange }: ClassGenericsEditorProps): JSX.Element {
  const value = generics.join(", ");
  return (
    <label className="uml-field">
      <span>Generics (comma-separated, e.g. T, K extends Comparable&lt;K&gt;)</span>
      <input
        type="text"
        defaultValue={value}
        onBlur={(e): void => {
          const next = e.target.value
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          if (next.join(",") !== generics.join(",")) onChange(next);
        }}
      />
    </label>
  );
}

/* ---------------------------- Attributes ---------------------------- */

interface AttributesSectionProps {
  readonly attributes: Attribute[];
  readonly types: readonly string[];
  readonly onChange: (next: Attribute[]) => void;
}

function AttributesSection({ attributes, types, onChange }: AttributesSectionProps): JSX.Element {
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
              <select
                aria-label="Attribute type"
                value={attr.type ?? ""}
                onChange={(e): void =>
                  replace(index, (prev) =>
                    e.target.value === "" ? omit(prev, "type") : { ...prev, type: e.target.value },
                  )
                }
                className="uml-class-members__type"
              >
                <option value="">—</option>
                {types.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
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
  readonly types: readonly string[];
  readonly onChange: (next: Operation[]) => void;
}

function OperationsSection({
  operations,
  interfaceImpliedAbstract,
  types,
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
                <select
                  aria-label="Return type"
                  value={op.returnType ?? ""}
                  onChange={(e): void =>
                    replace(index, (prev) =>
                      e.target.value === ""
                        ? omit(prev, "returnType")
                        : { ...prev, returnType: e.target.value },
                    )
                  }
                  className="uml-class-members__type"
                >
                  <option value="">—</option>
                  {types.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
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
                    <select
                      aria-label="Parameter type"
                      value={param.type ?? ""}
                      onChange={(e): void =>
                        updateParam(index, pIndex, (prev) =>
                          e.target.value === ""
                            ? omit(prev, "type")
                            : { ...prev, type: e.target.value },
                        )
                      }
                    >
                      <option value="">—</option>
                      {types.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
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
  "generics",
] as const satisfies ReadonlyArray<keyof DiagramNode>;
