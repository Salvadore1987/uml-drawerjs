import type { Diagram, DiagramEdge, DiagramNode } from "../model/types.js";
import { compartmentContentWidth } from "../renderer/nodes.js";
import type {
  ElkConstructorLike,
  ElkEdgeLike,
  ElkLike,
  ElkNodeLike,
  LayoutCoordinates,
  LayoutOptions,
  LayoutResult,
} from "./types.js";
import { resolveDefaults } from "./types.js";

/**
 * ELK adapter — dynamic-loaded so the heavy worker bundle stays out of
 * the core's main entry. The first call to `runElkLayout` triggers the
 * lazy import; subsequent calls reuse the cached constructor.
 *
 * Boundary groups (`group.kind === "boundary"`) become nested ELK nodes
 * with their own children — that's how ELK lays out C4 boundaries
 * correctly. Other group kinds (package / system) are not yet rendered
 * structurally and stay flat for now.
 *
 * The loader is overridable so tests can hand us a stub `ELK` whose
 * `layout(...)` returns a pre-canned `ElkNode` tree — no worker, no
 * dependency on `globalThis.Worker`.
 */
let cachedConstructor: ElkConstructorLike | null = null;

async function defaultLoader(): Promise<ElkConstructorLike> {
  // Static analysis cannot follow this dynamic import to a published
  // entrypoint we don't statically reference, which is exactly the point:
  // the bundler keeps elkjs out of the main chunk.
  const mod = (await import("elkjs/lib/elk.bundled.js")) as {
    default: ElkConstructorLike;
  };
  return mod.default;
}

export interface ElkLayoutOptions extends LayoutOptions {
  /** ELK-specific algorithm name. Defaults to "layered". */
  readonly algorithm?: string;
}

export async function runElkLayout(
  diagram: Diagram,
  options?: ElkLayoutOptions,
): Promise<LayoutResult> {
  const ctor = await loadConstructor(options);
  const elk = new ctor();

  const { nodeWidth, nodeHeight, spacing } = resolveDefaults(options);
  const algorithm = options?.algorithm ?? defaultAlgorithmFor(diagram.type);
  const graph = buildElkGraph(diagram, { nodeWidth, nodeHeight, spacing, algorithm });

  const laid = await elk.layout(graph);
  const coordinates = collectCoordinates(laid);
  const { width, height } = boundingBoxOf(laid);
  return { coordinates, width, height, engine: "elk" };
}

/** Reset the cached ELK constructor — used by the test suite to start clean. */
export function resetElkLoader(): void {
  cachedConstructor = null;
}

async function loadConstructor(options?: LayoutOptions): Promise<ElkConstructorLike> {
  if (options?.elkLoader) return options.elkLoader();
  if (cachedConstructor) return cachedConstructor;
  const ctor = await defaultLoader();
  cachedConstructor = ctor;
  return ctor;
}

interface ElkBuildContext {
  readonly nodeWidth: number;
  readonly nodeHeight: number;
  readonly spacing: number;
  readonly algorithm: string;
}

function buildElkGraph(diagram: Diagram, ctx: ElkBuildContext): ElkNodeLike {
  const childrenInsideBoundary = new Set<string>();
  for (const group of diagram.groups) {
    if (group.kind !== "boundary") continue;
    for (const childId of group.children) childrenInsideBoundary.add(childId);
  }

  const nodeById = new Map(diagram.nodes.map((n) => [n.id, n] as const));

  // Compartment nodes (class / interface / enum / entity) reserve the width
  // their widest text line needs, so ELK spaces neighbours around the real
  // footprint instead of the uniform default — no overlap once the renderer
  // grows the box to the same width.
  const buildNode = (node: DiagramNode): ElkNodeLike => ({
    id: node.id,
    width: Math.max(ctx.nodeWidth, compartmentContentWidth(node)),
    height: ctx.nodeHeight,
  });

  const boundaryNodes: ElkNodeLike[] = [];
  for (const group of diagram.groups) {
    if (group.kind !== "boundary") continue;
    const children: ElkNodeLike[] = [];
    for (const childId of group.children) {
      const child = nodeById.get(childId);
      if (child) children.push(buildNode(child));
    }
    boundaryNodes.push({
      id: group.id,
      layoutOptions: { "elk.padding": "[top=24,left=24,right=24,bottom=24]" },
      children,
    });
  }

  const topLevelNodes: ElkNodeLike[] = [];
  for (const node of diagram.nodes) {
    if (childrenInsideBoundary.has(node.id)) continue;
    topLevelNodes.push(buildNode(node));
  }

  const edges: ElkEdgeLike[] = diagram.edges.map((edge: DiagramEdge) => ({
    id: edge.id,
    sources: [edge.source],
    targets: [edge.target],
  }));

  return {
    id: diagram.id,
    layoutOptions: {
      "elk.algorithm": ctx.algorithm,
      "elk.spacing.nodeNode": String(ctx.spacing),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(ctx.spacing),
      "elk.direction": "DOWN",
    },
    children: [...boundaryNodes, ...topLevelNodes],
    edges,
  };
}

function defaultAlgorithmFor(_type: Diagram["type"]): string {
  return "layered";
}

function collectCoordinates(node: ElkNodeLike): LayoutCoordinates {
  const out: LayoutCoordinates = {};
  const walk = (root: ElkNodeLike, originX: number, originY: number, isRoot: boolean): void => {
    const x = (root.x ?? 0) + originX;
    const y = (root.y ?? 0) + originY;
    if (!isRoot) out[root.id] = { x, y };
    for (const child of root.children ?? []) {
      walk(child, x, y, false);
    }
  };
  walk(node, 0, 0, true);
  return out;
}

function boundingBoxOf(node: ElkNodeLike): { width: number; height: number } {
  return {
    width: node.width ?? 0,
    height: node.height ?? 0,
  };
}

/** Test-only access to the internal cache, kept in this module so the
 *  test suite doesn't reach into private implementation details ad-hoc. */
export const __elkInternals = {
  getCachedConstructor(): ElkConstructorLike | null {
    return cachedConstructor;
  },
  setCachedConstructor(ctor: ElkConstructorLike | null): void {
    cachedConstructor = ctor;
  },
};

export type { ElkLike };
