import {
  removeEdgeCommand,
  removeGroupCommand,
  removeNodeCommand,
  updateEdgeCommand,
  updateGroupCommand,
  updateNodeCommand,
} from "@uml-drawer/core/commands";
import type { DiagramEdge, DiagramGroup, DiagramNode } from "@uml-drawer/core/model";
import { type HTMLAttributes, useContext, useEffect, useState } from "react";
import { UmlEditorContext } from "../internal/context.js";
import { useEditorState } from "../hooks/useEditorState.js";
import { useSelection } from "../hooks/useSelection.js";

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
      <div className="uml-field">
        <span>Kind</span>
        <code>{edge.kind}</code>
      </div>
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
  else body = renderEmpty();

  return (
    <aside className={composedClassName} aria-label={title} {...rest}>
      <header className="uml-props-panel__header">{title}</header>
      <div className="uml-props-panel__body">{body}</div>
    </aside>
  );
}
