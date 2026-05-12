import type { CombinedFragment, Diagram, SequenceDivider, SequenceNote } from "../model/types.js";
import { applyPatch } from "./base.js";
import type { Command } from "./base.js";

function appendFragment(diagram: Diagram, fragment: CombinedFragment): Diagram {
  return { ...diagram, fragments: [...(diagram.fragments ?? []), fragment] };
}

/**
 * Sequence-only ornament commands. Each one mirrors the
 * `updateEdgeCommand` / `removeEdgeCommand` shape so the history layer
 * and CommandBus treat them like any other AST mutation.
 *
 * Ornaments live in three optional top-level arrays on `Diagram`:
 *   - `fragments?: CombinedFragment[]`
 *   - `notes?: SequenceNote[]`
 *   - `dividers?: SequenceDivider[]`
 *
 * Update commands replace by id; remove commands drop by id and, when
 * the resulting array is empty, omit the field entirely so byte-equal
 * round-trips through `parse → generate → parse` keep working.
 */

// ---------- helpers ----------

function replaceFragment(diagram: Diagram, fragment: CombinedFragment): Diagram {
  if (!diagram.fragments) return diagram;
  return {
    ...diagram,
    fragments: diagram.fragments.map((f) => (f.id === fragment.id ? fragment : f)),
  };
}

function dropFragment(diagram: Diagram, fragmentId: string): Diagram {
  if (!diagram.fragments) return diagram;
  const next = diagram.fragments.filter((f) => f.id !== fragmentId);
  if (next.length === 0) {
    const { fragments: _omit, ...rest } = diagram;
    return rest;
  }
  return { ...diagram, fragments: next };
}

function replaceNote(diagram: Diagram, note: SequenceNote): Diagram {
  if (!diagram.notes) return diagram;
  return {
    ...diagram,
    notes: diagram.notes.map((n) => (n.id === note.id ? note : n)),
  };
}

function dropNote(diagram: Diagram, noteId: string): Diagram {
  if (!diagram.notes) return diagram;
  const next = diagram.notes.filter((n) => n.id !== noteId);
  if (next.length === 0) {
    const { notes: _omit, ...rest } = diagram;
    return rest;
  }
  return { ...diagram, notes: next };
}

function replaceDivider(diagram: Diagram, divider: SequenceDivider): Diagram {
  if (!diagram.dividers) return diagram;
  return {
    ...diagram,
    dividers: diagram.dividers.map((d) => (d.id === divider.id ? divider : d)),
  };
}

function dropDivider(diagram: Diagram, dividerId: string): Diagram {
  if (!diagram.dividers) return diagram;
  const next = diagram.dividers.filter((d) => d.id !== dividerId);
  if (next.length === 0) {
    const { dividers: _omit, ...rest } = diagram;
    return rest;
  }
  return { ...diagram, dividers: next };
}

// ---------- fragment: add ----------

export interface AddFragmentPayload {
  readonly fragment: CombinedFragment;
}

export type AddFragmentCommand = Command<"AddFragment", AddFragmentPayload>;

export function addFragmentCommand(fragment: CombinedFragment): AddFragmentCommand {
  const snapshot = structuredClone(fragment);
  const payload: AddFragmentPayload = { fragment: snapshot };
  return {
    kind: "AddFragment",
    payload,
    apply: (input) => appendFragment(input, payload.fragment),
    invert: (input) => dropFragment(input, payload.fragment.id),
  };
}

// ---------- fragment ----------

export type FragmentPatch = Partial<Omit<CombinedFragment, "id">>;

export interface UpdateFragmentPayload {
  readonly fragmentId: string;
  readonly before: CombinedFragment;
  readonly after: CombinedFragment;
}

export type UpdateFragmentCommand = Command<"UpdateFragment", UpdateFragmentPayload>;

export function updateFragmentCommand(
  fragmentId: string,
  patch: FragmentPatch,
  diagram: Diagram,
): UpdateFragmentCommand {
  const before = (diagram.fragments ?? []).find((f) => f.id === fragmentId);
  if (!before) {
    throw new Error(`updateFragmentCommand: fragment ${fragmentId} not found`);
  }
  const beforeSnap = structuredClone(before);
  const afterSnap = structuredClone(applyPatch(before, patch as Partial<CombinedFragment>));
  const payload: UpdateFragmentPayload = { fragmentId, before: beforeSnap, after: afterSnap };
  return {
    kind: "UpdateFragment",
    payload,
    apply: (input) => replaceFragment(input, payload.after),
    invert: (input) => replaceFragment(input, payload.before),
  };
}

export interface RemoveFragmentPayload {
  readonly fragmentId: string;
  readonly removed: CombinedFragment;
  readonly index: number;
}

export type RemoveFragmentCommand = Command<"RemoveFragment", RemoveFragmentPayload>;

export function removeFragmentCommand(fragmentId: string, diagram: Diagram): RemoveFragmentCommand {
  const fragments = diagram.fragments ?? [];
  const index = fragments.findIndex((f) => f.id === fragmentId);
  if (index < 0) {
    throw new Error(`removeFragmentCommand: fragment ${fragmentId} not found`);
  }
  const removed = structuredClone(fragments[index] as CombinedFragment);
  const payload: RemoveFragmentPayload = { fragmentId, removed, index };
  return {
    kind: "RemoveFragment",
    payload,
    apply: (input) => dropFragment(input, payload.fragmentId),
    invert(input) {
      const list = input.fragments ?? [];
      const next = [...list];
      next.splice(payload.index, 0, payload.removed);
      return { ...input, fragments: next };
    },
  };
}

// ---------- note ----------

export type SequenceNotePatch = Partial<Omit<SequenceNote, "id">>;

export interface UpdateNotePayload {
  readonly noteId: string;
  readonly before: SequenceNote;
  readonly after: SequenceNote;
}

export type UpdateNoteCommand = Command<"UpdateNote", UpdateNotePayload>;

export function updateNoteCommand(
  noteId: string,
  patch: SequenceNotePatch,
  diagram: Diagram,
): UpdateNoteCommand {
  const before = (diagram.notes ?? []).find((n) => n.id === noteId);
  if (!before) {
    throw new Error(`updateNoteCommand: note ${noteId} not found`);
  }
  const beforeSnap = structuredClone(before);
  const afterSnap = structuredClone(applyPatch(before, patch as Partial<SequenceNote>));
  const payload: UpdateNotePayload = { noteId, before: beforeSnap, after: afterSnap };
  return {
    kind: "UpdateNote",
    payload,
    apply: (input) => replaceNote(input, payload.after),
    invert: (input) => replaceNote(input, payload.before),
  };
}

export interface RemoveNotePayload {
  readonly noteId: string;
  readonly removed: SequenceNote;
  readonly index: number;
}

export type RemoveNoteCommand = Command<"RemoveNote", RemoveNotePayload>;

export function removeNoteCommand(noteId: string, diagram: Diagram): RemoveNoteCommand {
  const notes = diagram.notes ?? [];
  const index = notes.findIndex((n) => n.id === noteId);
  if (index < 0) {
    throw new Error(`removeNoteCommand: note ${noteId} not found`);
  }
  const removed = structuredClone(notes[index] as SequenceNote);
  const payload: RemoveNotePayload = { noteId, removed, index };
  return {
    kind: "RemoveNote",
    payload,
    apply: (input) => dropNote(input, payload.noteId),
    invert(input) {
      const list = input.notes ?? [];
      const next = [...list];
      next.splice(payload.index, 0, payload.removed);
      return { ...input, notes: next };
    },
  };
}

// ---------- divider ----------

export type SequenceDividerPatch = Partial<Omit<SequenceDivider, "id">>;

export interface UpdateDividerPayload {
  readonly dividerId: string;
  readonly before: SequenceDivider;
  readonly after: SequenceDivider;
}

export type UpdateDividerCommand = Command<"UpdateDivider", UpdateDividerPayload>;

export function updateDividerCommand(
  dividerId: string,
  patch: SequenceDividerPatch,
  diagram: Diagram,
): UpdateDividerCommand {
  const before = (diagram.dividers ?? []).find((d) => d.id === dividerId);
  if (!before) {
    throw new Error(`updateDividerCommand: divider ${dividerId} not found`);
  }
  const beforeSnap = structuredClone(before);
  const afterSnap = structuredClone(applyPatch(before, patch as Partial<SequenceDivider>));
  const payload: UpdateDividerPayload = { dividerId, before: beforeSnap, after: afterSnap };
  return {
    kind: "UpdateDivider",
    payload,
    apply: (input) => replaceDivider(input, payload.after),
    invert: (input) => replaceDivider(input, payload.before),
  };
}

export interface RemoveDividerPayload {
  readonly dividerId: string;
  readonly removed: SequenceDivider;
  readonly index: number;
}

export type RemoveDividerCommand = Command<"RemoveDivider", RemoveDividerPayload>;

export function removeDividerCommand(dividerId: string, diagram: Diagram): RemoveDividerCommand {
  const dividers = diagram.dividers ?? [];
  const index = dividers.findIndex((d) => d.id === dividerId);
  if (index < 0) {
    throw new Error(`removeDividerCommand: divider ${dividerId} not found`);
  }
  const removed = structuredClone(dividers[index] as SequenceDivider);
  const payload: RemoveDividerPayload = { dividerId, removed, index };
  return {
    kind: "RemoveDivider",
    payload,
    apply: (input) => dropDivider(input, payload.dividerId),
    invert(input) {
      const list = input.dividers ?? [];
      const next = [...list];
      next.splice(payload.index, 0, payload.removed);
      return { ...input, dividers: next };
    },
  };
}
