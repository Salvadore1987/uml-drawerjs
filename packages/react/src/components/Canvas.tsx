import { useContext, type HTMLAttributes } from "react";
import { UmlEditorInternalContext } from "../internal/internal-context.js";

export interface CanvasProps extends HTMLAttributes<HTMLDivElement> {
  /** ARIA label for the surrounding region. */
  readonly ariaLabel?: string;
}

/**
 * Diagram surface. The component is a thin wrapper around a `<div>` whose
 * ref the parent `<UmlEditor>` uses as the host for `createEditor`. All
 * pan/zoom, keyboard navigation, and selection happen inside the SVG
 * that the core editor mounts into this node.
 *
 * The Canvas does NOT render the SVG itself — it only exposes its DOM
 * node so the underlying core editor can attach. The SVG is added to
 * the DOM after the first effect pass and stays there until the editor
 * is destroyed (unmount or `diagramType` change).
 */
export function Canvas({
  ariaLabel = "UML diagram canvas",
  className,
  ...rest
}: CanvasProps): JSX.Element {
  const internal = useContext(UmlEditorInternalContext);
  if (!internal) {
    throw new Error("<Canvas /> must be rendered inside <UmlEditor />.");
  }
  const composedClassName = ["uml-canvas-host", className].filter(Boolean).join(" ");
  return (
    <div
      ref={internal.registerCanvas}
      className={composedClassName}
      role="region"
      aria-label={ariaLabel}
      {...rest}
    />
  );
}
