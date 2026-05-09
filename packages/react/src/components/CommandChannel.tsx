import { type FormEvent, type HTMLAttributes, useContext, useState } from "react";
import { UmlEditorContext } from "../internal/context.js";
import type { useEditor } from "../hooks/useEditor.js";

export interface CommandResult {
  /** Was the slash-command consumed? `false` falls through to default routing. */
  readonly handled: boolean;
  /** Optional message to surface in the channel's transcript. */
  readonly message?: string;
}

export type CommandHandler = (
  args: readonly string[],
  context: { readonly editor: ReturnType<typeof useEditor> },
) => CommandResult | Promise<CommandResult>;

export interface CommandChannelProps extends HTMLAttributes<HTMLElement> {
  /** Header label. Defaults to "Command Channel". */
  readonly title?: string;
  /** Slash-command name → handler. The leading `/` is stripped before lookup. */
  readonly commands?: Record<string, CommandHandler>;
  /** Placeholder text. */
  readonly placeholder?: string;
  /** Maximum number of transcript entries to keep. Defaults to 12. */
  readonly historyLimit?: number;
}

interface TranscriptEntry {
  readonly id: number;
  readonly role: "user" | "system" | "error";
  readonly text: string;
}

/**
 * Slash-command shell — a thin primitive that wires a single-line input
 * and a transcript area. Hosts register handlers per command name; the
 * component takes care of parsing the leading `/`, splitting arguments
 * by whitespace, and reporting outcomes back into the transcript.
 *
 * The default behaviour, when no handler matches, surfaces an error
 * line. There is no built-in slash-command set — the playground (Phase
 * 13) wires `/add-class`, `/connect`, `/rename` etc. on top of this
 * primitive.
 */
export function CommandChannel({
  title = "Command Channel",
  commands = {},
  placeholder = "Type a command, e.g. /add-class Foo",
  historyLimit = 12,
  className,
  ...rest
}: CommandChannelProps): JSX.Element {
  const ctx = useContext(UmlEditorContext);
  const editor = ctx?.editor ?? null;
  const [draft, setDraft] = useState<string>("");
  const [transcript, setTranscript] = useState<readonly TranscriptEntry[]>([]);

  const append = (entry: Omit<TranscriptEntry, "id">): void => {
    setTranscript((prev) => {
      const next: TranscriptEntry = {
        ...entry,
        id: prev.length === 0 ? 1 : prev[prev.length - 1]!.id + 1,
      };
      const merged = [...prev, next];
      return merged.length > historyLimit ? merged.slice(merged.length - historyLimit) : merged;
    });
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    setDraft("");
    append({ role: "user", text: trimmed });

    if (!trimmed.startsWith("/")) {
      append({ role: "error", text: "Commands must start with `/`." });
      return;
    }

    const [head, ...args] = trimmed.slice(1).split(/\s+/u);
    const handler = head ? commands[head] : undefined;
    if (!handler) {
      append({ role: "error", text: `Unknown command: /${head ?? ""}` });
      return;
    }
    if (!editor) {
      append({ role: "error", text: "Editor is not ready yet — try again in a moment." });
      return;
    }

    try {
      const result = await handler(args, { editor });
      if (result.message) {
        append({ role: result.handled ? "system" : "error", text: result.message });
      }
    } catch (err) {
      append({ role: "error", text: err instanceof Error ? err.message : String(err) });
    }
  };

  const composedClassName = ["uml-command-channel", className].filter(Boolean).join(" ");

  return (
    <section className={composedClassName} aria-label={title} {...rest}>
      <header className="uml-command-channel__header">{title}</header>
      <ul className="uml-command-channel__transcript" aria-live="polite">
        {transcript.map((entry) => (
          <li
            key={entry.id}
            className={`uml-command-channel__entry uml-command-channel__entry--${entry.role}`}
          >
            <span className="uml-command-channel__role">
              {entry.role === "user" ? ">" : entry.role === "error" ? "!" : "·"}
            </span>
            <span className="uml-command-channel__text">{entry.text}</span>
          </li>
        ))}
      </ul>
      <form
        className="uml-command-channel__form"
        onSubmit={(event): void => {
          void submit(event);
        }}
      >
        <input
          className="uml-command-channel__input"
          value={draft}
          onChange={(event): void => setDraft(event.target.value)}
          placeholder={placeholder}
          aria-label="Command input"
        />
      </form>
    </section>
  );
}
