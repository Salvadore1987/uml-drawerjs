import { useEditor } from "@uml-drawer/react";
import { useEffect, useState } from "react";

/**
 * Floating zoom / fit / lock toolbar pinned to the bottom-right of the
 * canvas. Reads the editor instance through the React context exposed
 * by `<UmlEditor>` and reflects the current pan/zoom scale next to the
 * +/- buttons.
 */
export function CanvasToolbar(): JSX.Element | null {
  const editor = useEditor();
  const [scale, setScale] = useState<number>(1);
  const [locked, setLocked] = useState<boolean>(false);

  useEffect(() => {
    if (!editor) return;
    setScale(editor.panZoom?.getState().scale ?? 1);
    setLocked(editor.isLocked());
    const unsubscribe = editor.panZoom?.onChange((state) => {
      setScale(state.scale);
    });
    return () => {
      unsubscribe?.();
    };
  }, [editor]);

  if (!editor) return null;

  const percent = Math.round(scale * 100);

  const toggleLock = (): void => {
    const next = !locked;
    editor.setLocked(next);
    setLocked(next);
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
        aria-pressed={locked}
        onClick={toggleLock}
        title={locked ? "Unlock canvas (Cmd/Ctrl L)" : "Lock canvas (Cmd/Ctrl L)"}
        aria-label={locked ? "Unlock canvas" : "Lock canvas"}
      >
        {locked ? "🔒" : "🔓"}
      </button>
    </div>
  );
}
