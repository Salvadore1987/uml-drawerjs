import { type HTMLAttributes, useContext, useEffect, useRef, useState } from "react";
import { UmlEditorContext } from "../internal/context.js";
import { useEditorState } from "../hooks/useEditorState.js";

export interface TextEditorProps extends HTMLAttributes<HTMLElement> {
  /** Section heading. Defaults to "PlantUML". */
  readonly title?: string;
  /** Debounce window for parsing the text back into the AST (ms). */
  readonly debounceMs?: number;
}

/**
 * Plain-textarea editor for the PlantUML source. Keeps in sync with the
 * AST: every command from the bus refreshes the textarea (unless the
 * user is mid-edit), and a debounced flush parses the user's text back
 * into the AST via `editor.loadFromText`.
 *
 * The component intentionally does not embed CodeMirror — the
 * `@uml-drawer/codemirror-plantuml` package is the integration point
 * for that. Hosts can wrap their CodeMirror setup in a sibling
 * component and skip this one entirely.
 */
export function TextEditor({
  title = "PlantUML",
  debounceMs = 250,
  className,
  ...rest
}: TextEditorProps): JSX.Element {
  const ctx = useContext(UmlEditorContext);
  const editor = ctx?.editor ?? null;
  const { text } = useEditorState();
  const [draft, setDraft] = useState<string>(text);
  const dirtyRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!dirtyRef.current) {
      setDraft(text);
    }
  }, [text]);

  useEffect(
    () => (): void => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const handleChange = (next: string): void => {
    setDraft(next);
    if (!editor) return;
    dirtyRef.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      dirtyRef.current = false;
      void editor.loadFromText(next).catch(() => {
        /* surfaced via onValidate */
      });
    }, debounceMs);
  };

  const composedClassName = ["uml-text-editor", className].filter(Boolean).join(" ");

  return (
    <section className={composedClassName} aria-label={title} {...rest}>
      <header className="uml-text-editor__header">{title}</header>
      <textarea
        className="uml-text-editor__textarea"
        spellCheck={false}
        value={draft}
        onChange={(event): void => handleChange(event.target.value)}
        aria-label="PlantUML source"
        disabled={!editor}
      />
    </section>
  );
}
