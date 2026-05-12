import { removeNoteCommand, updateNoteCommand } from "@uml-drawer/core/commands";
import type { SequenceNote } from "@uml-drawer/core/model";
import { useContext } from "react";
import { UmlEditorContext } from "../internal/context.js";
import { useEditorState } from "../hooks/useEditorState.js";

/**
 * Inline editor for sequence notes. Lets the user edit text, change
 * placement (left of / right of / over), and pick which lifelines the
 * note attaches to. Multi-participant `over` notes accept any subset.
 */
export interface NoteEditorProps {
  readonly note: SequenceNote;
}

export function NoteEditor({ note }: NoteEditorProps): JSX.Element {
  const ctx = useContext(UmlEditorContext);
  const editor = ctx?.editor ?? null;
  const { ast } = useEditorState();

  const lifelines = ast.nodes.filter(
    (n) =>
      n.kind === "lifeline" ||
      n.kind === "actor" ||
      n.kind === "lifeline-boundary" ||
      n.kind === "lifeline-control" ||
      n.kind === "lifeline-entity" ||
      n.kind === "lifeline-collections" ||
      n.kind === "database" ||
      n.kind === "queue",
  );

  const commit = (patch: Partial<Omit<SequenceNote, "id">>): void => {
    if (!editor) return;
    editor.dispatch(updateNoteCommand(note.id, patch, editor.getState()));
  };

  const remove = (): void => {
    if (!editor) return;
    editor.dispatch(removeNoteCommand(note.id, editor.getState()));
  };

  const toggleParticipant = (id: string, checked: boolean): void => {
    if (note.placement === "over") {
      const next = checked ? [...note.participants, id] : note.participants.filter((p) => p !== id);
      commit({ participants: next });
    } else {
      // Left-of / right-of notes attach to a single lifeline.
      commit({ participants: [id] });
    }
  };

  return (
    <form
      className="uml-props-panel__form"
      onSubmit={(e) => e.preventDefault()}
      aria-label={`Note ${note.id}`}
    >
      <label className="uml-field uml-field--multiline">
        <span>Text</span>
        <textarea
          rows={3}
          defaultValue={note.text}
          onBlur={(e) => {
            if (e.target.value !== note.text) commit({ text: e.target.value });
          }}
        />
      </label>
      <label className="uml-field">
        <span>Placement</span>
        <select
          value={note.placement}
          onChange={(e) => commit({ placement: e.target.value as SequenceNote["placement"] })}
        >
          <option value="left">Left of</option>
          <option value="right">Right of</option>
          <option value="over">Over</option>
        </select>
      </label>
      <fieldset className="uml-class-members__section">
        <legend>Participants</legend>
        <div className="uml-class-members__list">
          {lifelines.map((lifeline) => {
            const checked = note.participants.includes(lifeline.id);
            return (
              <label key={lifeline.id} className="uml-field uml-field--inline">
                <input
                  type={note.placement === "over" ? "checkbox" : "radio"}
                  name={`note-${note.id}-participant`}
                  checked={checked}
                  onChange={(e) => toggleParticipant(lifeline.id, e.target.checked)}
                />
                <span>{lifeline.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <button type="button" className="uml-button uml-button--danger" onClick={remove}>
        Delete note
      </button>
    </form>
  );
}
