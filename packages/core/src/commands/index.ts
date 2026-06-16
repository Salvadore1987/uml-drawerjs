/**
 * CQRS command barrel — every AST mutation flows through one of these
 * factories so the history layer can replay them and a future CRDT layer
 * can serialize their payloads.
 */

export type { Command } from "./base.js";
export {
  applyPatch,
  appendNode,
  appendEdge,
  appendGroup,
  dropNode,
  dropEdge,
  dropGroup,
  replaceNode,
  replaceEdge,
  replaceGroup,
  setLayoutOverride,
  setLayoutOverrides,
} from "./base.js";

export { addNodeCommand } from "./addNode.js";
export type { AddNodeCommand, AddNodePayload } from "./addNode.js";

export { removeNodeCommand } from "./removeNode.js";
export type { RemoveNodeCommand, RemoveNodePayload } from "./removeNode.js";

export { moveNodeCommand } from "./moveNode.js";
export type { MoveNodeCommand, MoveNodePayload } from "./moveNode.js";

export { resizeNodeCommand } from "./resizeNode.js";
export type { ResizeNodeCommand, ResizeNodePayload, NodeRect } from "./resizeNode.js";

export { moveGroupCommand } from "./moveGroup.js";
export type { MoveGroupCommand, MoveGroupPayload } from "./moveGroup.js";

export { resizeGroupCommand } from "./resizeGroup.js";
export type { ResizeGroupCommand, ResizeGroupPayload } from "./resizeGroup.js";

export { updateNodeCommand } from "./updateNode.js";
export type { UpdateNodeCommand, UpdateNodePayload, NodePatch } from "./updateNode.js";

export { addEdgeCommand } from "./addEdge.js";
export type { AddEdgeCommand, AddEdgePayload } from "./addEdge.js";

export { removeEdgeCommand } from "./removeEdge.js";
export type { RemoveEdgeCommand, RemoveEdgePayload } from "./removeEdge.js";

export { updateEdgeCommand } from "./updateEdge.js";
export type { UpdateEdgeCommand, UpdateEdgePayload, EdgePatch } from "./updateEdge.js";

export { moveEdgeCommand } from "./moveEdge.js";
export type { MoveEdgeCommand, MoveEdgePayload } from "./moveEdge.js";

export { moveEdgeLabelCommand } from "./moveEdgeLabel.js";
export type { MoveEdgeLabelCommand, MoveEdgeLabelPayload } from "./moveEdgeLabel.js";

export { moveSequenceFragmentCommand } from "./moveSequenceFragment.js";
export type {
  MoveSequenceFragmentCommand,
  MoveSequenceFragmentPayload,
} from "./moveSequenceFragment.js";

export { resizeSequenceFragmentCommand } from "./resizeSequenceFragment.js";
export type {
  ResizeSequenceFragmentCommand,
  ResizeSequenceFragmentPayload,
  FragmentResizeSide,
} from "./resizeSequenceFragment.js";

export {
  addGroupCommand,
  updateGroupCommand,
  removeGroupCommand,
  addNodeToGroupCommand,
  removeNodeFromGroupCommand,
} from "./group.js";
export type {
  AddGroupCommand,
  AddGroupPayload,
  UpdateGroupCommand,
  UpdateGroupPayload,
  GroupPatch,
  RemoveGroupCommand,
  RemoveGroupPayload,
} from "./group.js";

export { reorderNodeCommand, reorderGroupCommand } from "./reorder.js";
export type {
  ReorderDirection,
  ReorderNodeCommand,
  ReorderNodePayload,
  ReorderGroupCommand,
  ReorderGroupPayload,
} from "./reorder.js";

export { applyLayoutCommand } from "./applyLayout.js";
export type { ApplyLayoutCommand, ApplyLayoutPayload } from "./applyLayout.js";

export { importTextCommand } from "./importText.js";
export type { ImportTextCommand, ImportTextPayload } from "./importText.js";

export {
  addActivationCommand,
  removeActivationCommand,
  updateActivationCommand,
  resizeActivationCommand,
  moveActivationToLifelineCommand,
} from "./activations.js";
export type {
  AddActivationCommand,
  AddActivationPayload,
  RemoveActivationCommand,
  RemoveActivationPayload,
  UpdateActivationCommand,
  UpdateActivationPayload,
  ActivationPatch,
  ResizeActivationCommand,
  ResizeActivationPayload,
  ActivationResizeSide,
  MoveActivationToLifelineCommand,
  MoveActivationToLifelinePayload,
} from "./activations.js";

export {
  addFragmentCommand,
  updateFragmentCommand,
  removeFragmentCommand,
  updateNoteCommand,
  removeNoteCommand,
  updateDividerCommand,
  removeDividerCommand,
} from "./sequenceOrnaments.js";
export type {
  AddFragmentCommand,
  AddFragmentPayload,
  UpdateFragmentCommand,
  UpdateFragmentPayload,
  FragmentPatch,
  RemoveFragmentCommand,
  RemoveFragmentPayload,
  UpdateNoteCommand,
  UpdateNotePayload,
  SequenceNotePatch,
  RemoveNoteCommand,
  RemoveNotePayload,
  UpdateDividerCommand,
  UpdateDividerPayload,
  SequenceDividerPatch,
  RemoveDividerCommand,
  RemoveDividerPayload,
} from "./sequenceOrnaments.js";

export { CommandBus } from "./bus.js";
export type { CommandBusEvent, CommandBusEventMap, CommandBusListener } from "./bus.js";
