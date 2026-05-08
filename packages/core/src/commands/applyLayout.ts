import type { Diagram, LayoutCoordinate } from "../model/types.js";
import { setLayoutOverrides } from "./base.js";
import type { Command } from "./base.js";

export interface ApplyLayoutPayload {
  readonly before: Record<string, LayoutCoordinate> | null;
  readonly after: Record<string, LayoutCoordinate>;
}

export type ApplyLayoutCommand = Command<"ApplyLayout", ApplyLayoutPayload>;

/**
 * Replace the entire `metadata.layoutOverrides` map. The "before" snapshot
 * is `null` if the diagram had no overrides at all — invert restores by
 * removing the property altogether, which keeps round-trip JSON equality
 * even for diagrams that started without any layout state.
 */
export function applyLayoutCommand(
  overrides: Record<string, LayoutCoordinate>,
  diagram: Diagram,
): ApplyLayoutCommand {
  const previous = diagram.metadata.layoutOverrides;
  const payload: ApplyLayoutPayload = {
    before: previous ? structuredClone(previous) : null,
    after: structuredClone(overrides),
  };

  return {
    kind: "ApplyLayout",
    payload,
    apply(input: Diagram): Diagram {
      return setLayoutOverrides(input, structuredClone(payload.after));
    },
    invert(input: Diagram): Diagram {
      return setLayoutOverrides(
        input,
        payload.before ? structuredClone(payload.before) : undefined,
      );
    },
  };
}
