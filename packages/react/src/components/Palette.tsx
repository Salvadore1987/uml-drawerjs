import { addNodeCommand } from "@uml-drawer/core/commands";
import type { DiagramType, NodeKind } from "@uml-drawer/core/model";
import { uuidv7 } from "@uml-drawer/core/model";
import { useContext, useMemo, type HTMLAttributes } from "react";
import { UmlEditorContext } from "../internal/context.js";

export interface PaletteItem {
  /** AST kind to instantiate when the user activates the item. */
  readonly kind: NodeKind;
  /** Display label. */
  readonly label: string;
  /** Visual / semantic group (rendered as a section heading). */
  readonly category: string;
  /** Diagram types this item applies to — used by the default filter. */
  readonly diagramTypes: readonly DiagramType[];
}

export type PaletteFilter = (item: PaletteItem) => boolean;

const PALETTE_ITEMS: readonly PaletteItem[] = [
  // C4
  {
    kind: "person",
    label: "Person",
    category: "C4 Actors",
    diagramTypes: ["c4-context", "c4-container", "c4-component"],
  },
  {
    kind: "person-external",
    label: "Person (External)",
    category: "C4 Actors",
    diagramTypes: ["c4-context", "c4-container", "c4-component"],
  },
  {
    kind: "system",
    label: "Software System",
    category: "C4 Systems",
    diagramTypes: ["c4-context", "c4-container", "c4-component"],
  },
  {
    kind: "system-external",
    label: "Software System (External)",
    category: "C4 Systems",
    diagramTypes: ["c4-context", "c4-container", "c4-component"],
  },
  {
    kind: "database",
    label: "Database",
    category: "C4 Systems",
    diagramTypes: ["c4-context", "c4-container", "c4-component"],
  },
  {
    kind: "queue",
    label: "Queue",
    category: "C4 Systems",
    diagramTypes: ["c4-context", "c4-container", "c4-component"],
  },
  {
    kind: "container",
    label: "Container",
    category: "C4 Containers",
    diagramTypes: ["c4-container", "c4-component"],
  },
  {
    kind: "component",
    label: "Component",
    category: "C4 Components",
    diagramTypes: ["c4-component"],
  },

  // Class
  { kind: "class", label: "Class", category: "Class", diagramTypes: ["class"] },
  { kind: "interface", label: "Interface", category: "Class", diagramTypes: ["class"] },
  { kind: "abstract-class", label: "Abstract Class", category: "Class", diagramTypes: ["class"] },
  { kind: "enum", label: "Enum", category: "Class", diagramTypes: ["class"] },

  // ER
  { kind: "entity", label: "Entity", category: "Entity Relationship", diagramTypes: ["er"] },

  // Sequence
  { kind: "lifeline", label: "Lifeline", category: "Sequence", diagramTypes: ["sequence"] },
  { kind: "actor", label: "Actor", category: "Sequence", diagramTypes: ["sequence"] },
];

export interface PaletteProps extends HTMLAttributes<HTMLElement> {
  /**
   * Override the entire item list. Use sparingly — most apps want
   * `paletteFilter` instead so the defaults stay aligned with the AST.
   */
  readonly items?: readonly PaletteItem[];
  /** Section label for the panel. */
  readonly title?: string;
}

/**
 * Categorised palette of node kinds. Items are filtered by the editor's
 * `diagramType` and the optional `paletteFilter` prop on `<UmlEditor>`,
 * then grouped by `category`. Activating an item dispatches an
 * `AddNodeCommand` with a fresh uuidv7 id and a "New {label}" placeholder.
 *
 * The component tolerates being mounted before the editor is ready —
 * during that brief first render it shows an empty stub so the layout
 * doesn't shift once the canvas registers its host.
 */
export function Palette({
  items = PALETTE_ITEMS,
  title = "Palette",
  className,
  ...rest
}: PaletteProps): JSX.Element {
  const ctx = useContext(UmlEditorContext);
  const editor = ctx?.editor ?? null;
  const diagramType = editor?.getState().type ?? null;
  const paletteFilter = ctx?.paletteFilter ?? null;

  const grouped = useMemo(() => {
    if (!diagramType) return [] as Array<{ category: string; items: PaletteItem[] }>;
    const eligible = items.filter(
      (item) =>
        item.diagramTypes.includes(diagramType) && (paletteFilter ? paletteFilter(item) : true),
    );
    const buckets = new Map<string, PaletteItem[]>();
    for (const item of eligible) {
      const bucket = buckets.get(item.category) ?? [];
      bucket.push(item);
      buckets.set(item.category, bucket);
    }
    return [...buckets.entries()].map(([category, list]) => ({ category, items: list }));
  }, [items, diagramType, paletteFilter]);

  const composedClassName = ["uml-palette", className].filter(Boolean).join(" ");

  const handleAdd = (item: PaletteItem): void => {
    if (!editor) return;
    editor.dispatch(
      addNodeCommand({
        id: uuidv7(),
        kind: item.kind,
        label: `New ${item.label}`,
      }),
    );
  };

  return (
    <aside className={composedClassName} aria-label={title} {...rest}>
      <header className="uml-palette__header">{title}</header>
      <div className="uml-palette__list">
        {grouped.length === 0 && (
          <div className="uml-palette__empty">
            {editor ? "No palette items match the current filter." : "Loading…"}
          </div>
        )}
        {grouped.map((group) => (
          <section key={group.category} className="uml-palette__section">
            <h4 className="uml-palette__category">{group.category}</h4>
            <ul className="uml-palette__items">
              {group.items.map((item) => (
                <li key={item.kind} className="uml-palette__item">
                  <button
                    type="button"
                    className="uml-palette__button"
                    onClick={(): void => handleAdd(item)}
                    data-kind={item.kind}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </aside>
  );
}

/** Default palette item table — handy for tests and external consumers. */
export const DEFAULT_PALETTE_ITEMS = PALETTE_ITEMS;
