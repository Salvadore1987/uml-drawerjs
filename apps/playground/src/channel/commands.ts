import {
  addEdgeCommand,
  addGroupCommand,
  addNodeCommand,
  removeGroupCommand,
  updateNodeCommand,
} from "@uml-drawer/core/commands";
import { uuidv7 } from "@uml-drawer/core/model";
import type { CommandHandler } from "@uml-drawer/react";

/**
 * Slash-command handlers wired into `<CommandChannel>`. Each handler
 * dispatches a CQRS command against the live editor; success messages
 * flow back into the channel transcript so the user sees what they did.
 *
 *   /add-class Foo
 *   /connect Foo Bar uses
 *   /rename oldId NewLabel
 *   /group "Boundary" id1 id2 …
 *   /ungroup groupId
 */
export const PLAYGROUND_COMMANDS: Record<string, CommandHandler> = {
  "add-class": (args, { editor }) => {
    if (!editor) return { handled: false };
    const label = args.join(" ").trim();
    if (!label) {
      return { handled: false, message: "Usage: /add-class <label>" };
    }
    editor.dispatch(addNodeCommand({ id: uuidv7(), kind: "class", label }));
    return { handled: true, message: `Added class "${label}".` };
  },

  connect: (args, { editor }) => {
    if (!editor) return { handled: false };
    const [sourceArg, targetArg, kindArg = "association"] = args;
    if (!sourceArg || !targetArg) {
      return {
        handled: false,
        message: "Usage: /connect <source> <target> [kind]",
      };
    }
    const diagram = editor.getState();
    const source = resolveNodeId(diagram, sourceArg);
    const target = resolveNodeId(diagram, targetArg);
    if (!source) return { handled: false, message: `Unknown node: ${sourceArg}` };
    if (!target) return { handled: false, message: `Unknown node: ${targetArg}` };
    editor.dispatch(
      addEdgeCommand({
        id: uuidv7(),
        source,
        target,
        kind: kindArg as never,
      }),
    );
    return { handled: true, message: `Connected ${sourceArg} → ${targetArg} (${kindArg}).` };
  },

  rename: (args, { editor }) => {
    if (!editor) return { handled: false };
    const [needle, ...rest] = args;
    const newLabel = rest.join(" ").trim();
    if (!needle || !newLabel) {
      return { handled: false, message: "Usage: /rename <id-or-label> <new label>" };
    }
    const diagram = editor.getState();
    const nodeId = resolveNodeId(diagram, needle);
    if (!nodeId) return { handled: false, message: `Unknown node: ${needle}` };
    editor.dispatch(updateNodeCommand(nodeId, { label: newLabel }, diagram));
    return { handled: true, message: `Renamed ${needle} → "${newLabel}".` };
  },

  group: (args, { editor }) => {
    if (!editor) return { handled: false };
    if (args.length < 2) {
      return { handled: false, message: "Usage: /group <label> <id|label>…" };
    }
    const [labelToken, ...members] = args;
    const diagram = editor.getState();
    const childIds: string[] = [];
    for (const member of members) {
      const id = resolveNodeId(diagram, member);
      if (!id) return { handled: false, message: `Unknown node: ${member}` };
      childIds.push(id);
    }
    editor.dispatch(
      addGroupCommand({
        id: uuidv7(),
        kind: "boundary",
        label: labelToken!,
        children: childIds,
      }),
    );
    return { handled: true, message: `Grouped ${childIds.length} elements as "${labelToken}".` };
  },

  ungroup: (args, { editor }) => {
    if (!editor) return { handled: false };
    const [token] = args;
    if (!token) return { handled: false, message: "Usage: /ungroup <id-or-label>" };
    const diagram = editor.getState();
    const group =
      diagram.groups.find((g) => g.id === token) ??
      diagram.groups.find((g) => g.label.toLowerCase() === token.toLowerCase());
    if (!group) return { handled: false, message: `Unknown group: ${token}` };
    editor.dispatch(removeGroupCommand(group.id, diagram));
    return { handled: true, message: `Ungrouped "${group.label}".` };
  },
};

function resolveNodeId(
  diagram: { readonly nodes: ReadonlyArray<{ id: string; label: string }> },
  needle: string,
): string | null {
  const byId = diagram.nodes.find((n) => n.id === needle);
  if (byId) return byId.id;
  const byLabel = diagram.nodes.find((n) => n.label.toLowerCase() === needle.toLowerCase());
  return byLabel?.id ?? null;
}
