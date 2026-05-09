import type { EditorChangeEvent, EditorInstance } from "@uml-drawer/core/editor";
import { createEmptyDiagram } from "@uml-drawer/core/model";
import { useContext, useEffect, useState } from "react";
import { UmlEditorContext } from "../internal/context.js";

/**
 * Subscribe to the editor's command stream and return the freshest
 * `EditorChangeEvent` snapshot. Mirrors the payload that the underlying
 * `createEditor.onChange` callback emits — text, ast, errors, command.
 *
 * The hook tolerates the brief moment before the editor is ready
 * (between `<UmlEditor>` mount and `<Canvas>` registering its host) by
 * returning a placeholder snapshot derived from a fresh empty diagram.
 * Once the editor exists, the effect installs a bus subscriber and
 * regular updates kick in. Strict-mode safe — listeners are detached on
 * cleanup.
 */
export function useEditorState(): EditorChangeEvent {
  const value = useContext(UmlEditorContext);
  if (value === null) {
    throw new Error("useEditorState() must be called inside <UmlEditor>.");
  }
  const editor = value.editor;
  const [event, setEvent] = useState<EditorChangeEvent>(() =>
    editor ? snapshot(editor, null) : placeholder(),
  );

  useEffect(() => {
    if (!editor) {
      setEvent(placeholder());
      return undefined;
    }
    setEvent(snapshot(editor, null));
    return editor.bus.on("after", ({ command }) => {
      setEvent(snapshot(editor, command));
    });
  }, [editor]);

  return event;
}

function snapshot(
  editor: EditorInstance,
  command: EditorChangeEvent["command"],
): EditorChangeEvent {
  return {
    text: editor.exportText(),
    ast: editor.getState(),
    errors: editor.getErrors(),
    command,
  };
}

function placeholder(): EditorChangeEvent {
  return {
    text: "",
    ast: createEmptyDiagram("class"),
    errors: [],
    command: null,
  };
}
