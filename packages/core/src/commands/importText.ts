import type { Diagram } from "../model/types.js";
import type { Command } from "./base.js";

export interface ImportTextPayload {
  readonly before: Diagram;
  readonly after: Diagram;
}

export type ImportTextCommand = Command<"ImportText", ImportTextPayload>;

/**
 * Replace the AST in its entirety — used after the parser produces a fresh
 * `Diagram` from text. Both pre- and post-snapshots are captured in the
 * payload so undo/redo replay against any future state cleanly.
 */
export function importTextCommand(replacement: Diagram, diagram: Diagram): ImportTextCommand {
  const payload: ImportTextPayload = {
    before: structuredClone(diagram),
    after: structuredClone(replacement),
  };

  return {
    kind: "ImportText",
    payload,
    apply(_input: Diagram): Diagram {
      return structuredClone(payload.after);
    },
    invert(_input: Diagram): Diagram {
      return structuredClone(payload.before);
    },
  };
}
