import { type HTMLAttributes } from "react";
import { useEditorState } from "../hooks/useEditorState.js";
import { useSelection } from "../hooks/useSelection.js";

export interface OutlineProps extends HTMLAttributes<HTMLElement> {
  /** Section heading. Defaults to "Outline". */
  readonly title?: string;
}

/**
 * Tree-style summary of the diagram: groups, then nodes, then edges.
 * Each row is selectable and writes through to the shared selection
 * model — clicking an outline row highlights the corresponding element
 * in the canvas (and vice versa).
 */
export function Outline({ title = "Outline", className, ...rest }: OutlineProps): JSX.Element {
  const { ast } = useEditorState();
  const [selected, controller] = useSelection();
  const composedClassName = ["uml-outline", className].filter(Boolean).join(" ");

  const renderRow = (
    id: string,
    label: string,
    detail: string,
    role: "group" | "node" | "edge",
  ): JSX.Element => {
    const isSelected = selected.has(id);
    return (
      <li key={id} className={`uml-outline__row uml-outline__row--${role}`}>
        <button
          type="button"
          className={`uml-outline__button${isSelected ? " uml-outline__button--selected" : ""}`}
          aria-pressed={isSelected}
          onClick={(event): void => {
            if (event.metaKey || event.ctrlKey) {
              controller.toggle(id);
            } else {
              controller.set([id]);
            }
          }}
          data-id={id}
          data-role={role}
        >
          <span className="uml-outline__label">{label}</span>
          <span className="uml-outline__detail">{detail}</span>
        </button>
      </li>
    );
  };

  return (
    <aside className={composedClassName} aria-label={title} {...rest}>
      <header className="uml-outline__header">{title}</header>
      {ast.groups.length > 0 && (
        <section className="uml-outline__section">
          <h4 className="uml-outline__category">Groups</h4>
          <ul className="uml-outline__list">
            {ast.groups.map((group) =>
              renderRow(group.id, group.label || "(untitled group)", group.kind, "group"),
            )}
          </ul>
        </section>
      )}
      <section className="uml-outline__section">
        <h4 className="uml-outline__category">Nodes</h4>
        <ul className="uml-outline__list">
          {ast.nodes.length === 0 && <li className="uml-outline__empty">No nodes yet.</li>}
          {ast.nodes.map((node) =>
            renderRow(node.id, node.label || "(untitled)", node.kind, "node"),
          )}
        </ul>
      </section>
      {ast.edges.length > 0 && (
        <section className="uml-outline__section">
          <h4 className="uml-outline__category">Edges</h4>
          <ul className="uml-outline__list">
            {ast.edges.map((edge) =>
              renderRow(
                edge.id,
                edge.label || edge.kind,
                `${edge.source} → ${edge.target}`,
                "edge",
              ),
            )}
          </ul>
        </section>
      )}
    </aside>
  );
}
