import {
  removeEdgeCommand,
  removeGroupCommand,
  removeNodeCommand,
  updateEdgeCommand,
  updateGroupCommand,
  updateNodeCommand,
} from "@uml-drawer/core/commands";
import type {
  CombinedFragment,
  DiagramEdge,
  DiagramGroup,
  DiagramNode,
  EdgeKind,
  NodeKind,
  SequenceDivider,
  SequenceNote,
} from "@uml-drawer/core/model";
import { type HTMLAttributes, useContext, useEffect, useState } from "react";
import { UmlEditorContext } from "../internal/context.js";
import { useEditorState } from "../hooks/useEditorState.js";
import { useSelection } from "../hooks/useSelection.js";
import { ClassMembersEditor } from "./ClassMembersEditor.js";
import { EntityMembersEditor } from "./EntityMembersEditor.js";
import { FragmentEditor } from "./FragmentEditor.js";
import { NoteEditor } from "./NoteEditor.js";
import { DividerEditor } from "./DividerEditor.js";

const CLASS_LIKE_KINDS = new Set(["class", "interface", "abstract-class", "enum"]);
const ER_EDGE_KINDS = new Set<EdgeKind>(["one-to-one", "one-to-many", "many-to-many"]);
const CARDINALITY_OPTIONS = ["1", "0..1", "0..*", "1..*"] as const;

const SEQUENCE_NODE_KINDS = new Set<NodeKind>([
  "lifeline",
  "actor",
  "lifeline-boundary",
  "lifeline-control",
  "lifeline-entity",
  "lifeline-collections",
  "database",
  "queue",
]);
const LIFELINE_KIND_OPTIONS: ReadonlyArray<{ value: NodeKind; label: string }> = [
  { value: "lifeline", label: "Participant" },
  { value: "actor", label: "Actor" },
  { value: "lifeline-boundary", label: "Boundary" },
  { value: "lifeline-control", label: "Control" },
  { value: "lifeline-entity", label: "Entity" },
  { value: "database", label: "Database" },
  { value: "queue", label: "Queue" },
  { value: "lifeline-collections", label: "Collections" },
];
const SEQUENCE_EDGE_KINDS = new Set<EdgeKind>([
  "sync-call",
  "async-call",
  "return",
  "create",
  "destroy",
  "lost-message",
  "found-message",
]);
const SEQUENCE_EDGE_KIND_OPTIONS: ReadonlyArray<{ value: EdgeKind; label: string }> = [
  { value: "sync-call", label: "Sync call (->)" },
  { value: "async-call", label: "Async call (->>)" },
  { value: "return", label: "Return (-->)" },
  { value: "create", label: "Create (**)" },
  { value: "destroy", label: "Destroy (!!)" },
  { value: "found-message", label: "Found message ([->)" },
  { value: "lost-message", label: "Lost message (->])" },
];

/**
 * Derive the canonical ER `EdgeKind` from a (source, target) cardinality
 * pair. Many-to-many wins when both ends are "many"; one-to-many when
 * exactly one end is "many"; otherwise one-to-one. The generator picks
 * the arrow shape from `EdgeKind`, so keeping `kind` in lockstep with
 * cardinality preserves PlantUML round-trip.
 */
function deriveErKind(source: string, target: string): EdgeKind {
  const isMany = (c: string): boolean => c === "0..*" || c === "1..*";
  if (isMany(source) && isMany(target)) return "many-to-many";
  if (isMany(source) || isMany(target)) return "one-to-many";
  return "one-to-one";
}

export interface PropsPanelProps extends HTMLAttributes<HTMLElement> {
  /** Heading shown above the form. Defaults to "Properties". */
  readonly title?: string;
}

interface FormState {
  label: string;
  stereotype: string;
  technology: string;
  description: string;
  edgeLabel: string;
  edgeKind: string;
  groupAlias: string;
  groupLabel: string;
  groupDescription: string;
}

const EMPTY_FORM: FormState = {
  label: "",
  stereotype: "",
  technology: "",
  description: "",
  edgeLabel: "",
  edgeKind: "",
  groupAlias: "",
  groupLabel: "",
  groupDescription: "",
};

/**
 * Inspector for the currently-selected node or edge. Shows the small
 * subset of properties that the AST surfaces today — label, stereotype,
 * technology, description, edge label/kind. Edits are debounced into
 * the local form state and committed to the bus on `blur` / `Enter`.
 *
 * When more than one element is selected the panel falls back to a
 * mass-action shell (delete / clear). When nothing is selected it
 * renders an empty placeholder.
 */
export function PropsPanel({
  title = "Properties",
  className,
  ...rest
}: PropsPanelProps): JSX.Element {
  const ctx = useContext(UmlEditorContext);
  const editor = ctx?.editor ?? null;
  const { ast } = useEditorState();
  const [selectedIds] = useSelection();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const selectedId = selectedIds.size === 1 ? [...selectedIds][0]! : null;
  const selectedNode = selectedId ? (ast.nodes.find((n) => n.id === selectedId) ?? null) : null;
  const selectedEdge =
    selectedId && !selectedNode ? (ast.edges.find((e) => e.id === selectedId) ?? null) : null;
  const selectedGroup =
    selectedId && !selectedNode && !selectedEdge
      ? (ast.groups.find((g) => g.id === selectedId) ?? null)
      : null;
  // Sequence ornament lookups — only one of these resolves per selection,
  // and each ornament id is disjoint from nodes / edges / groups.
  const selectedFragment: CombinedFragment | null =
    selectedId && !selectedNode && !selectedEdge && !selectedGroup
      ? (ast.fragments?.find((f) => f.id === selectedId) ?? null)
      : null;
  const selectedNote: SequenceNote | null =
    selectedId && !selectedNode && !selectedEdge && !selectedGroup && !selectedFragment
      ? (ast.notes?.find((n) => n.id === selectedId) ?? null)
      : null;
  const selectedDivider: SequenceDivider | null =
    selectedId &&
    !selectedNode &&
    !selectedEdge &&
    !selectedGroup &&
    !selectedFragment &&
    !selectedNote
      ? (ast.dividers?.find((d) => d.id === selectedId) ?? null)
      : null;

  useEffect(() => {
    if (selectedNode) {
      setForm({
        ...EMPTY_FORM,
        label: selectedNode.label ?? "",
        stereotype: selectedNode.stereotype ?? "",
        technology: selectedNode.technology ?? "",
        description: selectedNode.description ?? "",
      });
    } else if (selectedEdge) {
      setForm({
        ...EMPTY_FORM,
        edgeLabel: selectedEdge.label ?? "",
        edgeKind: selectedEdge.kind,
      });
    } else if (selectedGroup) {
      setForm({
        ...EMPTY_FORM,
        groupAlias: selectedGroup.alias ?? "",
        groupLabel: selectedGroup.label ?? "",
        groupDescription: selectedGroup.description ?? "",
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [selectedNode?.id, selectedEdge?.id, selectedGroup?.id]);

  const composedClassName = ["uml-props-panel", className].filter(Boolean).join(" ");

  const commitNode = (patch: Partial<DiagramNode>): void => {
    if (!selectedNode || !editor) return;
    editor.dispatch(updateNodeCommand(selectedNode.id, patch, editor.getState()));
  };
  const commitEdge = (patch: Partial<DiagramEdge>): void => {
    if (!selectedEdge || !editor) return;
    editor.dispatch(updateEdgeCommand(selectedEdge.id, patch, editor.getState()));
  };
  const commitGroup = (patch: Partial<DiagramGroup>): void => {
    if (!selectedGroup || !editor) return;
    editor.dispatch(updateGroupCommand(selectedGroup.id, patch, editor.getState()));
  };

  const renderEmpty = (): JSX.Element => (
    <div className="uml-props-panel__empty" role="status">
      Select a node or edge to inspect its properties.
    </div>
  );

  const renderMulti = (): JSX.Element => (
    <div className="uml-props-panel__multi">
      <p>{selectedIds.size} elements selected.</p>
    </div>
  );

  const renderNode = (node: DiagramNode): JSX.Element => (
    <form
      className="uml-props-panel__form"
      onSubmit={(e): void => e.preventDefault()}
      aria-label={`Properties for ${node.label || "untitled"}`}
    >
      <label className="uml-field">
        <span>Label</span>
        <input
          type="text"
          value={form.label}
          onChange={(e): void => setForm((prev) => ({ ...prev, label: e.target.value }))}
          onBlur={(): void => {
            if (form.label !== (node.label ?? "")) commitNode({ label: form.label });
          }}
        />
      </label>
      <label className="uml-field">
        <span>Stereotype</span>
        <input
          type="text"
          value={form.stereotype}
          onChange={(e): void => setForm((prev) => ({ ...prev, stereotype: e.target.value }))}
          onBlur={(): void => {
            if (form.stereotype !== (node.stereotype ?? "")) {
              commitNode({ stereotype: form.stereotype });
            }
          }}
        />
      </label>
      <label className="uml-field">
        <span>Technology</span>
        <input
          type="text"
          value={form.technology}
          onChange={(e): void => setForm((prev) => ({ ...prev, technology: e.target.value }))}
          onBlur={(): void => {
            if (form.technology !== (node.technology ?? "")) {
              commitNode({ technology: form.technology });
            }
          }}
        />
      </label>
      <label className="uml-field uml-field--multiline">
        <span>Description</span>
        <textarea
          rows={3}
          value={form.description}
          onChange={(e): void => setForm((prev) => ({ ...prev, description: e.target.value }))}
          onBlur={(): void => {
            if (form.description !== (node.description ?? "")) {
              commitNode({ description: form.description });
            }
          }}
        />
      </label>
      {CLASS_LIKE_KINDS.has(node.kind) && <ClassMembersEditor node={node} />}
      {node.kind === "entity" && <EntityMembersEditor node={node} />}
      {SEQUENCE_NODE_KINDS.has(node.kind) && (
        <label className="uml-field">
          <span>Lifeline kind</span>
          <select
            value={node.kind}
            onChange={(e): void => commitNode({ kind: e.target.value as NodeKind })}
          >
            {LIFELINE_KIND_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        type="button"
        className="uml-button uml-button--danger"
        onClick={(): void => {
          if (!editor) return;
          editor.dispatch(removeNodeCommand(node.id, editor.getState()));
        }}
      >
        Delete node
      </button>
    </form>
  );

  const renderEdge = (edge: DiagramEdge): JSX.Element => (
    <form
      className="uml-props-panel__form"
      onSubmit={(e): void => e.preventDefault()}
      aria-label={`Properties for edge ${edge.id}`}
    >
      <label className="uml-field">
        <span>Label</span>
        <input
          type="text"
          value={form.edgeLabel}
          onChange={(e): void => setForm((prev) => ({ ...prev, edgeLabel: e.target.value }))}
          onBlur={(): void => {
            if (form.edgeLabel !== (edge.label ?? "")) {
              commitEdge({ label: form.edgeLabel });
            }
          }}
        />
      </label>
      {SEQUENCE_EDGE_KINDS.has(edge.kind) ? (
        <label className="uml-field">
          <span>Kind</span>
          <select
            value={edge.kind}
            onChange={(e): void => commitEdge({ kind: e.target.value as EdgeKind })}
          >
            {SEQUENCE_EDGE_KIND_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div className="uml-field">
          <span>Kind</span>
          <code>{edge.kind}</code>
        </div>
      )}
      {SEQUENCE_EDGE_KINDS.has(edge.kind) && (
        <>
          <label className="uml-field uml-field--inline">
            <input
              type="checkbox"
              checked={Boolean(edge.activatesTarget)}
              onChange={(e): void => commitEdge({ activatesTarget: e.target.checked })}
            />
            <span>Activates target</span>
          </label>
          <label className="uml-field uml-field--inline">
            <input
              type="checkbox"
              checked={Boolean(edge.deactivatesSource)}
              onChange={(e): void => commitEdge({ deactivatesSource: e.target.checked })}
            />
            <span>Deactivates source</span>
          </label>
        </>
      )}
      {ER_EDGE_KINDS.has(edge.kind) && (
        <>
          <label className="uml-field">
            <span>Source cardinality</span>
            <select
              value={edge.cardinality?.source ?? "1"}
              onChange={(e): void => {
                const source = e.target.value;
                const target = edge.cardinality?.target ?? "1";
                commitEdge({ kind: deriveErKind(source, target), cardinality: { source, target } });
              }}
            >
              {CARDINALITY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="uml-field">
            <span>Target cardinality</span>
            <select
              value={edge.cardinality?.target ?? "1"}
              onChange={(e): void => {
                const target = e.target.value;
                const source = edge.cardinality?.source ?? "1";
                commitEdge({ kind: deriveErKind(source, target), cardinality: { source, target } });
              }}
            >
              {CARDINALITY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <button
        type="button"
        className="uml-button uml-button--danger"
        onClick={(): void => {
          if (!editor) return;
          editor.dispatch(removeEdgeCommand(edge.id, editor.getState()));
        }}
      >
        Delete edge
      </button>
    </form>
  );

  const renderGroup = (group: DiagramGroup): JSX.Element => (
    <form
      className="uml-props-panel__form"
      onSubmit={(e): void => e.preventDefault()}
      aria-label={`Properties for boundary ${group.label || "untitled"}`}
    >
      <div className="uml-field">
        <span>Kind</span>
        <code>{group.kind}</code>
      </div>
      <label className="uml-field">
        <span>Alias</span>
        <input
          type="text"
          value={form.groupAlias}
          // PlantUML aliases are `\w+` only — keep the user honest with
          // a pattern hint; non-matching values are dropped on commit.
          pattern="[A-Za-z0-9_]+"
          onChange={(e): void => setForm((prev) => ({ ...prev, groupAlias: e.target.value }))}
          onBlur={(): void => {
            const next = form.groupAlias.trim();
            // Empty string clears the alias — `buildAliasIndex` falls
            // back to label-as-alias when `WORD_ONLY` doesn't match.
            if (next !== (group.alias ?? "")) commitGroup({ alias: next });
          }}
        />
      </label>
      <label className="uml-field">
        <span>Label</span>
        <input
          type="text"
          value={form.groupLabel}
          onChange={(e): void => setForm((prev) => ({ ...prev, groupLabel: e.target.value }))}
          onBlur={(): void => {
            if (form.groupLabel !== (group.label ?? "")) {
              commitGroup({ label: form.groupLabel });
            }
          }}
        />
      </label>
      <label className="uml-field uml-field--multiline">
        <span>Description</span>
        <textarea
          rows={3}
          value={form.groupDescription}
          onChange={(e): void => setForm((prev) => ({ ...prev, groupDescription: e.target.value }))}
          onBlur={(): void => {
            if (form.groupDescription !== (group.description ?? "")) {
              commitGroup({ description: form.groupDescription });
            }
          }}
        />
      </label>
      <button
        type="button"
        className="uml-button uml-button--danger"
        onClick={(): void => {
          if (!editor) return;
          editor.dispatch(removeGroupCommand(group.id, editor.getState()));
        }}
      >
        Delete boundary
      </button>
    </form>
  );

  let body: JSX.Element;
  if (selectedIds.size === 0) body = renderEmpty();
  else if (selectedIds.size > 1) body = renderMulti();
  else if (selectedNode) body = renderNode(selectedNode);
  else if (selectedEdge) body = renderEdge(selectedEdge);
  else if (selectedGroup) body = renderGroup(selectedGroup);
  else if (selectedFragment) body = <FragmentEditor fragment={selectedFragment} />;
  else if (selectedNote) body = <NoteEditor note={selectedNote} />;
  else if (selectedDivider) body = <DividerEditor divider={selectedDivider} />;
  else body = renderEmpty();

  return (
    <aside className={composedClassName} aria-label={title} {...rest}>
      <header className="uml-props-panel__header">{title}</header>
      <div className="uml-props-panel__body">{body}</div>
    </aside>
  );
}
