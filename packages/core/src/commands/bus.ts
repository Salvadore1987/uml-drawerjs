import type { Diagram } from "../model/types.js";
import type { Command } from "./base.js";

/** Synchronously-emitted event payloads keyed by event name. */
export interface CommandBusEventMap {
  before: { command: Command; state: Diagram };
  after: { command: Command; previousState: Diagram; nextState: Diagram };
}

export type CommandBusEvent = keyof CommandBusEventMap;

export type CommandBusListener<E extends CommandBusEvent> = (
  payload: CommandBusEventMap[E],
) => void;

/**
 * Synchronous, in-memory command dispatcher. Holds the current `Diagram`
 * and emits `before` / `after` events around every dispatch. The history
 * stack and the editor renderer are the primary subscribers.
 *
 * The bus does NOT track undo/redo on its own — that is the `History`
 * class's responsibility (see `../history/stack.ts`).
 */
export class CommandBus {
  private state: Diagram;
  private readonly listeners: { [E in CommandBusEvent]: Array<CommandBusListener<E>> } = {
    before: [],
    after: [],
  };

  constructor(initial: Diagram) {
    this.state = initial;
  }

  getState(): Diagram {
    return this.state;
  }

  /**
   * Override the current state without dispatching a command. Used by the
   * history stack to install undo/redo replays without re-emitting bus
   * events that would re-track the action.
   */
  setState(next: Diagram): void {
    this.state = next;
  }

  dispatch(command: Command): Diagram {
    const previousState = this.state;
    this.emit("before", { command, state: previousState });
    const nextState = command.apply(previousState);
    this.state = nextState;
    this.emit("after", { command, previousState, nextState });
    return nextState;
  }

  on<E extends CommandBusEvent>(event: E, listener: CommandBusListener<E>): () => void {
    this.listeners[event].push(listener);
    return () => {
      const arr = this.listeners[event];
      const idx = arr.indexOf(listener);
      if (idx !== -1) arr.splice(idx, 1);
    };
  }

  private emit<E extends CommandBusEvent>(event: E, payload: CommandBusEventMap[E]): void {
    // Iterate over a snapshot so that listeners adding/removing during emit
    // don't mutate the live array out from under us.
    for (const listener of [...this.listeners[event]]) {
      listener(payload);
    }
  }
}
