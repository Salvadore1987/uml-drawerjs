import { type HTMLAttributes, type ReactNode } from "react";
import { useDiagramErrors } from "../hooks/useDiagramErrors.js";
import { useEditorState } from "../hooks/useEditorState.js";

export interface StatusbarProps extends HTMLAttributes<HTMLElement> {
  /** Optional label rendered before the metrics. */
  readonly label?: string;
  /** Slot for additional content rendered on the right side. */
  readonly trailing?: ReactNode;
}

/**
 * Bottom-of-the-editor status strip. By default surfaces:
 *
 *   - diagram type
 *   - node / edge / group counts
 *   - validator counts (errors / warnings / infos)
 *
 * Designed as a primitive — the playground swaps in latency telemetry
 * and skin-specific decorations on top of these defaults.
 */
export function Statusbar({ label, trailing, className, ...rest }: StatusbarProps): JSX.Element {
  const { ast } = useEditorState();
  const errors = useDiagramErrors();

  const counts = errors.reduce(
    (acc, error) => {
      if (error.severity === "error") acc.error += 1;
      else if (error.severity === "warning") acc.warning += 1;
      else acc.info += 1;
      return acc;
    },
    { error: 0, warning: 0, info: 0 },
  );

  const composedClassName = ["uml-statusbar", className].filter(Boolean).join(" ");

  return (
    <footer className={composedClassName} role="status" {...rest}>
      {label ? <span className="uml-statusbar__label">{label}</span> : null}
      <span className="uml-statusbar__metric" data-metric="type">
        {ast.type}
      </span>
      <span className="uml-statusbar__metric" data-metric="nodes">
        {ast.nodes.length} nodes
      </span>
      <span className="uml-statusbar__metric" data-metric="edges">
        {ast.edges.length} edges
      </span>
      <span className="uml-statusbar__metric" data-metric="groups">
        {ast.groups.length} groups
      </span>
      <span className="uml-statusbar__divider" aria-hidden="true" />
      <span className="uml-statusbar__metric uml-statusbar__metric--error" data-metric="errors">
        {counts.error} errors
      </span>
      <span className="uml-statusbar__metric uml-statusbar__metric--warning" data-metric="warnings">
        {counts.warning} warnings
      </span>
      <span className="uml-statusbar__metric uml-statusbar__metric--info" data-metric="infos">
        {counts.info} info
      </span>
      {trailing ? <span className="uml-statusbar__trailing">{trailing}</span> : null}
    </footer>
  );
}
