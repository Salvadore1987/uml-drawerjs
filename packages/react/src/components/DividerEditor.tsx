import { removeDividerCommand, updateDividerCommand } from "@uml-drawer/core/commands";
import type { SequenceDivider } from "@uml-drawer/core/model";
import { useContext } from "react";
import { UmlEditorContext } from "../internal/context.js";

/** Single-field editor for sequence dividers (`==Phase==` bands). */
export interface DividerEditorProps {
  readonly divider: SequenceDivider;
}

export function DividerEditor({ divider }: DividerEditorProps): JSX.Element {
  const ctx = useContext(UmlEditorContext);
  const editor = ctx?.editor ?? null;

  const commit = (patch: Partial<Omit<SequenceDivider, "id">>): void => {
    if (!editor) return;
    editor.dispatch(updateDividerCommand(divider.id, patch, editor.getState()));
  };

  const remove = (): void => {
    if (!editor) return;
    editor.dispatch(removeDividerCommand(divider.id, editor.getState()));
  };

  return (
    <form
      className="uml-props-panel__form"
      onSubmit={(e) => e.preventDefault()}
      aria-label={`Divider ${divider.id}`}
    >
      <label className="uml-field">
        <span>Label</span>
        <input
          type="text"
          defaultValue={divider.label}
          onBlur={(e) => {
            if (e.target.value !== divider.label) commit({ label: e.target.value });
          }}
        />
      </label>
      <button type="button" className="uml-button uml-button--danger" onClick={remove}>
        Delete divider
      </button>
    </form>
  );
}
