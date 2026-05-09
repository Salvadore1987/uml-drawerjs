import { addGroupCommand, addNodeCommand } from "@uml-drawer/core/commands";
import type { DiagramType, GroupKind, NodeKind } from "@uml-drawer/core/model";
import { uuidv7 } from "@uml-drawer/core/model";
import { useContext, useMemo, type HTMLAttributes } from "react";
import { UmlEditorContext } from "../internal/context.js";

export interface PaletteItem {
  /** AST kind to instantiate when the user activates the item. */
  readonly kind: NodeKind | GroupKind;
  /** Display label. */
  readonly label: string;
  /** Visual / semantic group (rendered as a section heading). */
  readonly category: string;
  /** Diagram types this item applies to — used by the default filter. */
  readonly diagramTypes: readonly DiagramType[];
  /**
   * What kind of element this item creates. Defaults to `"node"` so
   * existing palette tables stay backward-compatible. Set to `"group"`
   * for boundary-style entries — clicking such an item dispatches an
   * `addGroupCommand` instead of `addNodeCommand`.
   */
  readonly target?: "node" | "group";
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
    kind: "container-external",
    label: "Container (External)",
    category: "C4 Containers",
    diagramTypes: ["c4-container", "c4-component"],
  },
  {
    target: "group",
    kind: "boundary",
    label: "Boundary",
    category: "C4 Containers",
    diagramTypes: ["c4-context", "c4-container", "c4-component"],
  },
  {
    kind: "component",
    label: "Component",
    category: "C4 Components",
    diagramTypes: ["c4-component"],
  },
  {
    kind: "component-external",
    label: "Component (External)",
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
    const priority = (category: string): number =>
      categoryPriorityFor(diagramType).get(category) ?? 100;
    return [...buckets.entries()]
      .map(([category, list]) => ({ category, items: list }))
      .sort((a, b) => priority(a.category) - priority(b.category));
  }, [items, diagramType, paletteFilter]);

  const composedClassName = ["uml-palette", className].filter(Boolean).join(" ");

  const handleAdd = (item: PaletteItem): void => {
    if (!editor) return;
    if (item.target === "group") {
      editor.dispatch(
        addGroupCommand(
          {
            id: uuidv7(),
            kind: item.kind as GroupKind,
            label: `New ${item.label}`,
            children: [],
          },
          // Default rect so the freshly-added boundary appears at a
          // known place; the user can drag/resize it from there.
          { x: 0, y: 0, width: 320, height: 200 },
        ),
      );
      return;
    }
    editor.dispatch(
      addNodeCommand({
        id: uuidv7(),
        kind: item.kind as NodeKind,
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

/**
 * Per-tier ordering of palette categories. Sorting by this priority steers
 * authors toward the kinds c4model.com expects on the active tier — for a
 * Container diagram, Containers come first; Software Systems sink under
 * an "Other" heading because they belong outside the System_Boundary, not
 * inside it. The validator (`C4_BOUNDARY_TIER_MISMATCH`) catches the
 * remaining mistake; this UX nudge prevents it in the first place.
 */
function categoryPriorityFor(diagramType: DiagramType): Map<string, number> {
  switch (diagramType) {
    case "c4-context":
      return new Map([
        ["C4 Actors", 0],
        ["C4 Systems", 10],
        ["C4 Containers", 90], // boundary only — keep visible but low
      ]);
    case "c4-container":
      return new Map([
        ["C4 Containers", 0],
        ["C4 Actors", 20],
        ["C4 Systems", 30],
      ]);
    case "c4-component":
      return new Map([
        ["C4 Components", 0],
        ["C4 Containers", 10],
        ["C4 Actors", 20],
        ["C4 Systems", 30],
      ]);
    default:
      return new Map();
  }
}

/** Default palette item table — handy for tests and external consumers. */
export const DEFAULT_PALETTE_ITEMS = PALETTE_ITEMS;
