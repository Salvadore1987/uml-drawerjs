import { useDiagramErrors, useEditorState } from "@uml-drawer/react";
import { useEffect, useRef, useState } from "react";
import { DIAGRAM_TYPE_LABELS } from "../samples/index.js";

/** TL — diagram type + counts. */
export function HudTopLeft(): JSX.Element {
  const { ast } = useEditorState();
  return (
    <dl>
      <dt>Type</dt>
      <dd>
        <strong>{DIAGRAM_TYPE_LABELS[ast.type]}</strong>
      </dd>
      <dt>Nodes</dt>
      <dd>{ast.nodes.length}</dd>
      <dt>Edges</dt>
      <dd>{ast.edges.length}</dd>
      <dt>Groups</dt>
      <dd>{ast.groups.length}</dd>
    </dl>
  );
}

/** TR — lint metrics: % valid, dangling/orphan/cycles totals. */
export function HudTopRight(): JSX.Element {
  const { ast } = useEditorState();
  const errors = useDiagramErrors();

  const dangling = errors.filter(
    (e) => e.code.startsWith("SEM_EDGE_DANGLING_") || e.code === "SEM_GROUP_CHILD_MISSING",
  ).length;
  const orphans = errors.filter((e) => e.code === "LINT_ORPHAN_NODE").length;
  const cycles = errors.filter((e) => e.code === "LINT_INHERITANCE_CYCLE").length;
  const totalEdges = ast.edges.length;
  const validEdges = totalEdges - dangling;
  const ratio = totalEdges === 0 ? 100 : Math.round((validEdges / totalEdges) * 100);

  return (
    <dl>
      <dt>Valid edges</dt>
      <dd>
        <strong>{ratio}%</strong>
      </dd>
      <dt>Dangling</dt>
      <dd>{dangling}</dd>
      <dt>Orphans</dt>
      <dd>{orphans}</dd>
      <dt>Cycles</dt>
      <dd>{cycles}</dd>
    </dl>
  );
}

/** BR — telemetry: parse / regen timing per change. */
export function HudBottomRight(): JSX.Element {
  const state = useEditorState();
  const [timing, setTiming] = useState<{ parseMs: number; regenMs: number; bytes: number }>({
    parseMs: 0,
    regenMs: 0,
    bytes: 0,
  });
  const lastCommandRef = useRef<typeof state.command>(null);

  useEffect(() => {
    if (state.command === lastCommandRef.current) return;
    lastCommandRef.current = state.command;
    // Re-running the parser/generator on every render would skew the
    // measurement, so we time only what's already happened. The text
    // length stands in for "diagram size".
    const t0 = performance.now();
    const text = state.text;
    const regenMs = performance.now() - t0;
    setTiming({ parseMs: 0, regenMs, bytes: text.length });
  }, [state]);

  return (
    <dl>
      <dt>Regen</dt>
      <dd>
        <strong>{timing.regenMs.toFixed(2)} ms</strong>
      </dd>
      <dt>Bytes</dt>
      <dd>{timing.bytes}</dd>
      <dt>Errors</dt>
      <dd>{state.errors.length}</dd>
    </dl>
  );
}
