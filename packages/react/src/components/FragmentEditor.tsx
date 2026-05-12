import { removeFragmentCommand, updateFragmentCommand } from "@uml-drawer/core/commands";
import type { CombinedFragment, FragmentKind, FragmentOperand } from "@uml-drawer/core/model";
import { uuidv7 } from "@uml-drawer/core/model";
import { useContext } from "react";
import { UmlEditorContext } from "../internal/context.js";

/**
 * Inline editor for combined fragments (alt / opt / loop / par / break /
 * critical / ref). Lets the user pick a kind, edit the header label, and
 * manage the operand list. Multi-operand kinds (`alt`, `par`) gain an
 * `+ Add operand` button; single-operand kinds (`opt`, `loop`, `break`,
 * `critical`, `ref`) hide it.
 */
export interface FragmentEditorProps {
  readonly fragment: CombinedFragment;
}

const FRAGMENT_KINDS: ReadonlyArray<{ value: FragmentKind; label: string }> = [
  { value: "alt", label: "alt — alternatives" },
  { value: "opt", label: "opt — optional" },
  { value: "loop", label: "loop — loop" },
  { value: "par", label: "par — parallel" },
  { value: "break", label: "break — break" },
  { value: "critical", label: "critical — critical region" },
  { value: "ref", label: "ref — reference" },
];

const MULTI_OPERAND: ReadonlySet<FragmentKind> = new Set(["alt", "par"]);

export function FragmentEditor({ fragment }: FragmentEditorProps): JSX.Element {
  const ctx = useContext(UmlEditorContext);
  const editor = ctx?.editor ?? null;

  const commit = (patch: Partial<Omit<CombinedFragment, "id">>): void => {
    if (!editor) return;
    editor.dispatch(updateFragmentCommand(fragment.id, patch, editor.getState()));
  };

  const replaceOperand = (
    index: number,
    transform: (op: FragmentOperand) => FragmentOperand,
  ): void => {
    const current = fragment.operands[index];
    if (!current) return;
    const next = transform(current);
    const operands = [...fragment.operands];
    operands[index] = next;
    commit({ operands });
  };

  const addOperand = (): void => {
    const operands = [...fragment.operands, { id: uuidv7(), edges: [] } as FragmentOperand];
    commit({ operands });
  };

  const removeOperand = (index: number): void => {
    const operands = fragment.operands.filter((_, i) => i !== index);
    commit({ operands });
  };

  const remove = (): void => {
    if (!editor) return;
    editor.dispatch(removeFragmentCommand(fragment.id, editor.getState()));
  };

  return (
    <form
      className="uml-props-panel__form"
      onSubmit={(e) => e.preventDefault()}
      aria-label={`Fragment ${fragment.kind}`}
    >
      <label className="uml-field">
        <span>Kind</span>
        <select
          value={fragment.kind}
          onChange={(e) => {
            const nextKind = e.target.value as FragmentKind;
            // alt / par require >= 2 operands to satisfy the
            // `SequenceFragmentTooFewOperands` validator. Auto-pad the
            // operand list when switching into a multi-operand kind so
            // the fragment doesn't go invalid the moment the user picks
            // it from the dropdown. Padded operands start empty (the
            // user moves messages into them later).
            const needsMulti = MULTI_OPERAND.has(nextKind);
            if (needsMulti && fragment.operands.length < 2) {
              const padded: FragmentOperand[] = [
                ...fragment.operands,
                ...Array.from({ length: 2 - fragment.operands.length }, () => ({
                  id: uuidv7(),
                  edges: [] as string[],
                  guard: "else",
                })),
              ];
              commit({ kind: nextKind, operands: padded });
            } else {
              commit({ kind: nextKind });
            }
          }}
        >
          {FRAGMENT_KINDS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="uml-field">
        <span>Label</span>
        <input
          type="text"
          defaultValue={fragment.label ?? ""}
          onBlur={(e) => {
            const value = e.target.value;
            if (value !== (fragment.label ?? "")) commit({ label: value });
          }}
        />
      </label>
      <fieldset className="uml-class-members__section">
        <legend>Operands</legend>
        <div className="uml-class-members__list">
          {fragment.operands.map((operand, i) => (
            <div key={operand.id} className="uml-class-members__row">
              <input
                type="text"
                placeholder={i === 0 ? "guard" : "else guard"}
                defaultValue={operand.guard ?? ""}
                onBlur={(e) => replaceOperand(i, (prev) => ({ ...prev, guard: e.target.value }))}
              />
              <span className="uml-class-members__hint">
                {operand.edges.length} message{operand.edges.length === 1 ? "" : "s"}
              </span>
              {fragment.operands.length > 1 && (
                <button
                  type="button"
                  className="uml-button uml-button--ghost"
                  onClick={() => removeOperand(i)}
                  aria-label={`Remove operand ${i + 1}`}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        {MULTI_OPERAND.has(fragment.kind) && (
          <button type="button" className="uml-button uml-class-members__add" onClick={addOperand}>
            + Add operand
          </button>
        )}
      </fieldset>
      <button type="button" className="uml-button uml-button--danger" onClick={remove}>
        Delete fragment
      </button>
    </form>
  );
}
