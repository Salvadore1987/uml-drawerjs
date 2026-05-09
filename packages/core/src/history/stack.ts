import type { Command } from "../commands/base.js";
import type { CommandBus } from "../commands/bus.js";
import type { Diagram } from "../model/types.js";
import { never } from "./coalesce.js";
import type { CoalescePredicate } from "./coalesce.js";

/** A single undo step — one or more commands that undo together. */
export type CommandFrame = readonly Command[];

export interface HistoryOptions {
  /**
   * Maximum gap (ms) between two dispatches for them to be candidates for
   * coalescing. Defaults to `0` — coalesce never triggers.
   */
  coalesceWindowMs?: number;
  /**
   * Predicate deciding whether two adjacent commands should share an undo
   * frame. Defaults to `never` (one frame per command).
   */
  coalescePredicate?: CoalescePredicate;
}

/**
 * Undo / redo stack on top of a `CommandBus`. The bus owns the current
 * `Diagram`; the history orchestrates dispatch, push/pop of frames, and
 * coalesce policy. `undo` / `redo` install replays via `bus.setState`,
 * which is why those calls do NOT re-emit `before` / `after` — clients that
 * care about replays should subscribe to the history's own events.
 */
export class History {
  private readonly bus: CommandBus;
  private readonly undoStack: Command[][] = [];
  private readonly redoStack: Command[][] = [];
  private lastDispatchTs: number | null = null;
  private readonly coalesceWindowMs: number;
  private readonly coalescePredicate: CoalescePredicate;

  constructor(bus: CommandBus, options: HistoryOptions = {}) {
    this.bus = bus;
    this.coalesceWindowMs = options.coalesceWindowMs ?? 0;
    this.coalescePredicate = options.coalescePredicate ?? never;
  }

  /** Current `Diagram` — convenience pass-through. */
  getState(): Diagram {
    return this.bus.getState();
  }

  /** Underlying bus, for clients that want raw event subscriptions. */
  getBus(): CommandBus {
    return this.bus;
  }

  /** Whether at least one frame can be undone. */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Whether at least one frame can be redone. */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Apply a command, append to the undo stack, and clear the redo stack.
   * If the command is eligible for coalescing with the last frame, it is
   * appended to that frame instead of opening a new one.
   */
  dispatch(command: Command): Diagram {
    const next = this.bus.dispatch(command);
    const now = Date.now();
    const lastFrame = this.undoStack[this.undoStack.length - 1];
    const lastCommand = lastFrame ? lastFrame[lastFrame.length - 1] : undefined;
    const withinWindow =
      this.lastDispatchTs !== null && now - this.lastDispatchTs <= this.coalesceWindowMs;
    if (lastFrame && lastCommand && withinWindow && this.coalescePredicate(lastCommand, command)) {
      lastFrame.push(command);
    } else {
      this.undoStack.push([command]);
    }
    this.redoStack.length = 0;
    this.lastDispatchTs = now;
    return next;
  }

  undo(): Diagram | undefined {
    const frame = this.undoStack.pop();
    if (!frame) return undefined;
    let state = this.bus.getState();
    for (let i = frame.length - 1; i >= 0; i--) {
      const command = frame[i];
      if (!command) continue;
      state = command.invert(state);
    }
    this.bus.setState(state);
    this.redoStack.push([...frame]);
    // Reset coalesce timer — the next user dispatch should never coalesce
    // with a frame that has just been undone.
    this.lastDispatchTs = null;
    return state;
  }

  redo(): Diagram | undefined {
    const frame = this.redoStack.pop();
    if (!frame) return undefined;
    let state = this.bus.getState();
    for (const command of frame) {
      state = command.apply(state);
    }
    this.bus.setState(state);
    this.undoStack.push([...frame]);
    this.lastDispatchTs = null;
    return state;
  }

  /**
   * Apply a list of commands as a single undo frame. All commands are
   * dispatched through the bus in order, but pushed onto the undo stack
   * as one atomic frame — `undo()` rewinds the whole batch, `redo()`
   * re-applies the whole batch. Used by group-move (drag of N
   * selected nodes) so the user gets one undo step.
   *
   * Empty arrays are a no-op. Non-empty: bus state is mutated for each
   * command, redo stack is cleared once.
   */
  dispatchAll(commands: readonly Command[]): Diagram {
    if (commands.length === 0) return this.bus.getState();
    let state = this.bus.getState();
    for (const command of commands) {
      state = this.bus.dispatch(command);
    }
    this.undoStack.push([...commands]);
    this.redoStack.length = 0;
    this.lastDispatchTs = Date.now();
    return state;
  }

  /** Forget all undo / redo history. The bus's current state is untouched. */
  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.lastDispatchTs = null;
  }
}
