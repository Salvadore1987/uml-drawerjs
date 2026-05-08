import type {
  Diagram,
  DiagramEdge,
  DiagramGroup,
  DiagramNode,
  LayoutCoordinate,
} from "../model/types.js";

/**
 * Symmetric command interface — every AST mutation is a `Command`. `apply`
 * advances the AST, `invert` rolls it back. Both functions are pure: they
 * never mutate the input `Diagram`, they always return a new instance.
 *
 * Factory functions (e.g. `addNodeCommand`) capture both pre- and post-state
 * snapshots in the `payload` so that `apply → invert` produces a JSON-byte
 * equal round-trip — required by the Phase 3 exit criterion and by the
 * Phase 17 ADR-0004 collaboration-readiness checklist.
 */
export interface Command<TKind extends string = string, TPayload = unknown> {
  readonly kind: TKind;
  readonly payload: TPayload;
  apply(diagram: Diagram): Diagram;
  invert(diagram: Diagram): Diagram;
}

/**
 * Apply a partial patch to an immutable record while honouring
 * `exactOptionalPropertyTypes`: explicit `undefined` values are skipped so
 * that optional fields remain absent instead of being set to `undefined`.
 */
export function applyPatch<T extends object>(base: T, patch: Partial<T>): T {
  const result: T = { ...base };
  for (const key of Object.keys(patch) as Array<keyof T>) {
    const value = patch[key];
    if (value !== undefined) {
      result[key] = value as T[keyof T];
    }
  }
  return result;
}

/** Replace a single node by id; returns a new `Diagram`. */
export function replaceNode(diagram: Diagram, node: DiagramNode): Diagram {
  return {
    ...diagram,
    nodes: diagram.nodes.map((n) => (n.id === node.id ? node : n)),
  };
}

/** Replace a single edge by id; returns a new `Diagram`. */
export function replaceEdge(diagram: Diagram, edge: DiagramEdge): Diagram {
  return {
    ...diagram,
    edges: diagram.edges.map((e) => (e.id === edge.id ? edge : e)),
  };
}

/** Replace a single group by id; returns a new `Diagram`. */
export function replaceGroup(diagram: Diagram, group: DiagramGroup): Diagram {
  return {
    ...diagram,
    groups: diagram.groups.map((g) => (g.id === group.id ? group : g)),
  };
}

/** Append a node; returns a new `Diagram`. */
export function appendNode(diagram: Diagram, node: DiagramNode): Diagram {
  return { ...diagram, nodes: [...diagram.nodes, node] };
}

/** Append an edge; returns a new `Diagram`. */
export function appendEdge(diagram: Diagram, edge: DiagramEdge): Diagram {
  return { ...diagram, edges: [...diagram.edges, edge] };
}

/** Append a group; returns a new `Diagram`. */
export function appendGroup(diagram: Diagram, group: DiagramGroup): Diagram {
  return { ...diagram, groups: [...diagram.groups, group] };
}

/** Drop a node by id (no edge cascading); returns a new `Diagram`. */
export function dropNode(diagram: Diagram, nodeId: string): Diagram {
  return { ...diagram, nodes: diagram.nodes.filter((n) => n.id !== nodeId) };
}

/** Drop an edge by id; returns a new `Diagram`. */
export function dropEdge(diagram: Diagram, edgeId: string): Diagram {
  return { ...diagram, edges: diagram.edges.filter((e) => e.id !== edgeId) };
}

/** Drop a group by id; returns a new `Diagram`. */
export function dropGroup(diagram: Diagram, groupId: string): Diagram {
  return { ...diagram, groups: diagram.groups.filter((g) => g.id !== groupId) };
}

/**
 * Replace the entire `metadata.layoutOverrides` map. Pass `undefined` to
 * remove the property altogether (preserves `exactOptionalPropertyTypes`
 * semantics — important for byte-equal round-trips when a diagram had no
 * layout before a layout was applied).
 */
export function setLayoutOverrides(
  diagram: Diagram,
  overrides: Record<string, LayoutCoordinate> | undefined,
): Diagram {
  if (overrides === undefined) {
    const { layoutOverrides: _omit, ...rest } = diagram.metadata;
    return { ...diagram, metadata: rest };
  }
  return {
    ...diagram,
    metadata: { ...diagram.metadata, layoutOverrides: overrides },
  };
}

/**
 * Set/clear a single layout-override entry. Used by `MoveNodeCommand`.
 */
export function setLayoutOverride(
  diagram: Diagram,
  nodeId: string,
  position: LayoutCoordinate | undefined,
): Diagram {
  const current = diagram.metadata.layoutOverrides ?? {};
  if (position === undefined) {
    if (!(nodeId in current)) return diagram;
    const next = { ...current };
    delete next[nodeId];
    if (Object.keys(next).length === 0) {
      return setLayoutOverrides(diagram, undefined);
    }
    return setLayoutOverrides(diagram, next);
  }
  return setLayoutOverrides(diagram, { ...current, [nodeId]: position });
}
