import type { EdgeKind } from "@uml-drawer/core/model";
import { useEditor } from "@uml-drawer/react";
import { useEffect, useState } from "react";

const SEQUENCE_EDGE_KIND_OPTIONS: ReadonlyArray<{
  value: EdgeKind;
  label: string;
}> = [
  { value: "sync-call", label: "→ Sync" },
  { value: "async-call", label: "↠ Async" },
  { value: "return", label: "⇠ Return" },
  { value: "create", label: "★ Create" },
  { value: "destroy", label: "✕ Destroy" },
  { value: "found-message", label: "⊙→ Found" },
  { value: "lost-message", label: "→⊙ Lost" },
];

/**
 * Floating zoom / fit / lock toolbar pinned to the bottom-right of the
 * canvas. Reads the editor instance through the React context exposed
 * by `<UmlEditor>` and reflects the current pan/zoom scale next to the
 * +/- buttons.
 *
 * Sequence diagrams gain an extra edge-kind dropdown so the user can
 * pre-pick the message kind (sync / async / return / create / destroy /
 * found / lost) before drag-to-connect — bypassing the post-creation
 * Kind dropdown round-trip in PropsPanel. Combined fragments
 * (alt / opt / loop / par / break / critical / ref) live in the Palette
 * sidebar instead of this floating toolbar so they sit next to the
 * lifeline kinds they wrap.
 */
export function CanvasToolbar(): JSX.Element | null {
  const editor = useEditor();
  const [scale, setScale] = useState<number>(1);
  const [locked, setLocked] = useState<boolean>(false);
  const [gridVisible, setGridVisible] = useState<boolean>(true);
  const [diagramType, setDiagramType] = useState<string>("");
  const [edgeKind, setEdgeKind] = useState<EdgeKind | "auto">("auto");

  useEffect(() => {
    if (!editor) return;
    setScale(editor.panZoom?.getState().scale ?? 1);
    setLocked(editor.isLocked());
    setGridVisible(editor.isGridVisible());
    setDiagramType(editor.getState().type);
    const override = editor.getEdgeKindOverride();
    setEdgeKind(override ?? "auto");
    const unsubscribePanZoom = editor.panZoom?.onChange((state) => {
      setScale(state.scale);
    });
    const unsubscribeGrid = editor.onGridChange((visible) => {
      setGridVisible(visible);
    });
    return () => {
      unsubscribePanZoom?.();
      unsubscribeGrid();
    };
  }, [editor]);

  if (!editor) return null;

  const percent = Math.round(scale * 100);

  const toggleLock = (): void => {
    const next = !locked;
    editor.setLocked(next);
    setLocked(next);
  };

  const toggleGrid = (): void => {
    const next = editor.toggleGrid();
    setGridVisible(next);
  };

  const onEdgeKindChange = (value: string): void => {
    if (value === "auto") {
      editor.setEdgeKindOverride(null);
      setEdgeKind("auto");
    } else {
      editor.setEdgeKindOverride(value as EdgeKind);
      setEdgeKind(value as EdgeKind);
    }
  };

  return (
    <div className="uml-canvas-toolbar" role="toolbar" aria-label="Canvas controls" data-no-pan="">
      <button
        type="button"
        className="uml-canvas-toolbar__button"
        onClick={(): void => editor.zoomOut()}
        title="Zoom out (Cmd/Ctrl −)"
        aria-label="Zoom out"
      >
        −
      </button>
      <button
        type="button"
        className="uml-canvas-toolbar__readout"
        onClick={(): void => editor.zoomReset()}
        title="Reset zoom (Cmd/Ctrl 0)"
      >
        {percent}%
      </button>
      <button
        type="button"
        className="uml-canvas-toolbar__button"
        onClick={(): void => editor.zoomIn()}
        title="Zoom in (Cmd/Ctrl +)"
        aria-label="Zoom in"
      >
        +
      </button>
      <span className="uml-canvas-toolbar__divider" aria-hidden="true" />
      <button
        type="button"
        className="uml-canvas-toolbar__button"
        onClick={(): void => editor.fitToView()}
        title="Fit to view (F)"
        aria-label="Fit to view"
      >
        ⤢
      </button>
      <button
        type="button"
        className="uml-canvas-toolbar__button"
        aria-pressed={gridVisible}
        onClick={toggleGrid}
        title={gridVisible ? "Hide grid (⌘⇧G)" : "Show grid (⌘⇧G)"}
        aria-label={gridVisible ? "Hide grid" : "Show grid"}
      >
        ▦
      </button>
      <button
        type="button"
        className="uml-canvas-toolbar__button"
        aria-pressed={locked}
        onClick={toggleLock}
        title={locked ? "Unlock canvas (Cmd/Ctrl L)" : "Lock canvas (Cmd/Ctrl L)"}
        aria-label={locked ? "Unlock canvas" : "Lock canvas"}
      >
        {locked ? "🔒" : "🔓"}
      </button>
      {diagramType === "sequence" && (
        <>
          <span className="uml-canvas-toolbar__divider" aria-hidden="true" />
          <select
            className="uml-canvas-toolbar__select"
            value={edgeKind}
            onChange={(e): void => onEdgeKindChange(e.target.value)}
            title="Default kind for new messages drawn by drag-to-connect"
            aria-label="New-message kind"
          >
            <option value="auto">Auto (sync)</option>
            {SEQUENCE_EDGE_KIND_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}
