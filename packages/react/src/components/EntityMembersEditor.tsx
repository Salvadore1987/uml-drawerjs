import { updateNodeCommand } from "@uml-drawer/core/commands";
import type { Attribute, DiagramNode } from "@uml-drawer/core/model";
import { uuidv7, SQL_TYPES } from "@uml-drawer/core/model";
import { useContext, useMemo } from "react";
import { UmlEditorContext } from "../internal/context.js";
import { useEditorState } from "../hooks/useEditorState.js";

/**
 * Inline editor for entity columns (ER diagrams). Mirrors `ClassMembersEditor`
 * but exposes only the attribute compartment — entities don't carry methods,
 * generics, or enum literals — and surfaces three ER-specific flags per row:
 *
 *   - **Primary key** (`*` marker, name underlined in the canvas; implies NN)
 *   - **Foreign key** (`+` marker / prefix in the canvas)
 *   - **Required** (NN — name rendered bold, generator emits `<<NN>>`)
 *
 * Edits commit immediately through `updateNodeCommand` so the props panel
 * stays in sync with both the canvas and the PlantUML code editor.
 */
export interface EntityMembersEditorProps {
  readonly node: DiagramNode;
}

/**
 * Live list of types eligible for entity columns: the SQL vocabulary
 * (`SQL_TYPES` — ER diagrams model a persistence schema) plus every entity
 * label currently in the diagram (so a column can reference another entity by
 * name when modelling foreign keys with embedded types).
 */
function useTypeOptions(): string[] {
  const { ast } = useEditorState();
  return useMemo(() => {
    const labels = ast.nodes
      .filter((n) => n.kind === "entity" && n.label.trim() !== "")
      .map((n) => n.label.trim());
    const merged = new Set<string>([...SQL_TYPES, ...labels]);
    return [...merged].sort((a, b) => a.localeCompare(b));
  }, [ast]);
}

export function EntityMembersEditor({ node }: EntityMembersEditorProps): JSX.Element {
  const ctx = useContext(UmlEditorContext);
  const editor = ctx?.editor ?? null;
  const types = useTypeOptions();
  const entityOptions = useEntityOptions(node.id);

  if (node.kind !== "entity") return <></>;

  const setNode = (patch: (prev: DiagramNode) => DiagramNode): void => {
    if (!editor) return;
    const next = patch(node);
    editor.dispatch(updateNodeCommand(node.id, nodePatchFrom(node, next), editor.getState()));
  };

  return (
    <div className="uml-class-members">
      <AttributesSection
        attributes={node.attributes ?? []}
        types={types}
        entityOptions={entityOptions}
        onChange={(next): void =>
          setNode((prev) =>
            next.length > 0 ? { ...prev, attributes: next } : omit(prev, "attributes"),
          )
        }
      />
    </div>
  );
}

/** A candidate foreign-key target: another entity plus its column names. */
interface EntityOption {
  readonly id: string;
  readonly label: string;
  readonly columns: readonly string[];
}

/** Other entities in the diagram (excluding `selfId`) eligible as FK targets. */
function useEntityOptions(selfId: string): EntityOption[] {
  const { ast } = useEditorState();
  return useMemo(
    () =>
      ast.nodes
        .filter((n) => n.kind === "entity" && n.id !== selfId)
        .map((n) => ({
          id: n.id,
          label: n.label.trim() || n.id,
          columns: (n.attributes ?? []).map((a) => a.name),
        })),
    [ast, selfId],
  );
}

/* ---------------------------- Attributes ---------------------------- */

interface AttributesSectionProps {
  readonly attributes: Attribute[];
  readonly types: readonly string[];
  readonly entityOptions: readonly EntityOption[];
  readonly onChange: (next: Attribute[]) => void;
}

function AttributesSection({
  attributes,
  types,
  entityOptions,
  onChange,
}: AttributesSectionProps): JSX.Element {
  const replace = (index: number, transform: (prev: Attribute) => Attribute): void => {
    onChange(attributes.map((attr, i) => (i === index ? transform(attr) : attr)));
  };
  const remove = (index: number): void => {
    onChange(attributes.filter((_, i) => i !== index));
  };
  const add = (): void => {
    const fresh: Attribute = { id: uuidv7(), name: "column" };
    onChange([...attributes, fresh]);
  };

  return (
    <section className="uml-class-members__section">
      <header className="uml-class-members__heading">Attributes</header>
      {attributes.length === 0 ? (
        <p className="uml-class-members__empty">No attributes yet.</p>
      ) : (
        <ul className="uml-class-members__list">
          {attributes.map((attr, index) => {
            const isPk = attr.primaryKey === true;
            const required = attr.nullable === false || isPk;
            return (
              <li key={attr.id} className="uml-class-members__row">
                <input
                  type="text"
                  aria-label="Attribute name"
                  placeholder="column"
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
                      e.target.value === ""
                        ? omit(prev, "type")
                        : { ...prev, type: e.target.value },
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
                <input
                  type="text"
                  aria-label="Default value"
                  placeholder="default"
                  value={attr.default ?? ""}
                  onChange={(e): void =>
                    replace(index, (prev) =>
                      e.target.value === ""
                        ? omit(prev, "default")
                        : { ...prev, default: e.target.value },
                    )
                  }
                  className="uml-class-members__default"
                />
                <label
                  className="uml-class-members__flag"
                  title="Primary key (rendered with underline; implies NOT NULL)"
                >
                  <input
                    type="checkbox"
                    checked={isPk}
                    onChange={(e): void =>
                      replace(index, (prev) => {
                        if (e.target.checked) {
                          // PK implies NOT NULL — set nullable=false alongside
                          // so renderer + generator agree.
                          return { ...prev, primaryKey: true, nullable: false };
                        }
                        return omit(prev, "primaryKey");
                      })
                    }
                  />
                  <span>PK</span>
                </label>
                <label
                  className="uml-class-members__flag"
                  title="Foreign key (rendered with `+` prefix)"
                >
                  <input
                    type="checkbox"
                    checked={attr.foreignKey === true}
                    onChange={(e): void =>
                      replace(index, (prev) =>
                        e.target.checked
                          ? { ...prev, foreignKey: true }
                          : omit(omit(prev, "foreignKey"), "references"),
                      )
                    }
                  />
                  <span>FK</span>
                </label>
                <label
                  className="uml-class-members__flag"
                  title="Required / NOT NULL (rendered bold). Always on when PK is set."
                >
                  <input
                    type="checkbox"
                    checked={required}
                    disabled={isPk}
                    onChange={(e): void =>
                      replace(index, (prev) =>
                        e.target.checked ? { ...prev, nullable: false } : omit(prev, "nullable"),
                      )
                    }
                  />
                  <span>Required</span>
                </label>
                <button
                  type="button"
                  aria-label="Remove attribute"
                  className="uml-class-members__remove"
                  onClick={(): void => remove(index)}
                >
                  ✕
                </button>
                {attr.foreignKey === true && (
                  <div className="uml-class-members__fk-ref">
                    <span className="uml-class-members__fk-ref-label">References</span>
                    <select
                      aria-label="FK target entity"
                      value={attr.references?.entity ?? ""}
                      onChange={(e): void =>
                        replace(index, (prev) =>
                          e.target.value === ""
                            ? omit(prev, "references")
                            : { ...prev, references: { entity: e.target.value } },
                        )
                      }
                      className="uml-class-members__fk-entity"
                    >
                      <option value="">— table —</option>
                      {entityOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="FK target column"
                      value={attr.references?.column ?? ""}
                      disabled={!attr.references?.entity}
                      onChange={(e): void =>
                        replace(index, (prev) => {
                          if (!prev.references) return prev;
                          return e.target.value === ""
                            ? { ...prev, references: { entity: prev.references.entity } }
                            : {
                                ...prev,
                                references: {
                                  entity: prev.references.entity,
                                  column: e.target.value,
                                },
                              };
                        })
                      }
                      className="uml-class-members__fk-column"
                    >
                      <option value="">(column)</option>
                      {(
                        entityOptions.find((opt) => opt.id === attr.references?.entity)?.columns ??
                        []
                      ).map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" className="uml-button uml-class-members__add" onClick={add}>
        + Add attribute
      </button>
    </section>
  );
}

/* ----------------------------- helpers ------------------------------ */

function omit<T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  const { [key]: _removed, ...rest } = obj;
  void _removed;
  return rest;
}

function nodePatchFrom(before: DiagramNode, after: DiagramNode): Partial<DiagramNode> {
  const patch: Partial<DiagramNode> = {};
  for (const key of NODE_PATCHABLE_KEYS) {
    if (before[key] !== after[key]) {
      (patch as Record<string, unknown>)[key] = after[key];
    }
  }
  return patch;
}

const NODE_PATCHABLE_KEYS = ["attributes"] as const satisfies ReadonlyArray<keyof DiagramNode>;
