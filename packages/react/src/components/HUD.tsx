import { type HTMLAttributes, type ReactNode } from "react";

export interface HUDSlots {
  /** Top-left slot. */
  readonly tl?: ReactNode;
  /** Top-right slot. */
  readonly tr?: ReactNode;
  /** Bottom-left slot. */
  readonly bl?: ReactNode;
  /** Bottom-right slot. */
  readonly br?: ReactNode;
}

export interface HUDProps extends HTMLAttributes<HTMLDivElement>, HUDSlots {
  /** Optional accessible label for the overlay. */
  readonly ariaLabel?: string;
}

/**
 * Four-corner overlay primitive. Renders only the slots the caller
 * provides — empty slots are omitted entirely so there are no stray
 * empty elements in the DOM. The component intentionally has no
 * default content: the playground's HUD bindings (diagram type
 * counter, lint metrics, legend, telemetry) live there, not here.
 */
export function HUD({
  tl,
  tr,
  bl,
  br,
  ariaLabel = "Editor HUD",
  className,
  ...rest
}: HUDProps): JSX.Element {
  const composedClassName = ["uml-hud", className].filter(Boolean).join(" ");
  return (
    <div className={composedClassName} aria-label={ariaLabel} {...rest}>
      {tl ? (
        <div className="uml-hud__slot uml-hud__slot--tl" data-slot="tl">
          {tl}
        </div>
      ) : null}
      {tr ? (
        <div className="uml-hud__slot uml-hud__slot--tr" data-slot="tr">
          {tr}
        </div>
      ) : null}
      {bl ? (
        <div className="uml-hud__slot uml-hud__slot--bl" data-slot="bl">
          {bl}
        </div>
      ) : null}
      {br ? (
        <div className="uml-hud__slot uml-hud__slot--br" data-slot="br">
          {br}
        </div>
      ) : null}
    </div>
  );
}
