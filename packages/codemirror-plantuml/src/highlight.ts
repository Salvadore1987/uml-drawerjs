import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { tags as t } from "@lezer/highlight";

/**
 * Highlight tag set used by `streamTokenizer` (see `language.ts`). Each
 * token returned by the tokenizer maps onto one of these names; the
 * `HighlightStyle` below pairs them with class names that resolve through
 * the `--uml-*` theming contract — no hex literals here, no skin
 * specifics. Themes downstream of this package can override the same
 * classes (`.tok-keyword`, `.tok-string`, …) without touching CodeMirror.
 */
export const highlightTags = {
  keyword: t.keyword,
  controlKeyword: t.controlKeyword,
  typeName: t.typeName,
  string: t.string,
  number: t.number,
  comment: t.lineComment,
  metaComment: t.meta,
  operator: t.operator,
  arrow: t.punctuation,
  variableName: t.variableName,
  bracket: t.bracket,
  invalid: t.invalid,
} as const;

export type HighlightTagName = keyof typeof highlightTags;

/**
 * The default highlight style. Maps each tag onto a CSS class that
 * references a `--uml-*` token. The intent is that downstream apps can
 * either:
 *
 *   1. Use this style as-is (it inherits the host's `--uml-*` palette).
 *   2. Pass `{ scope: language }` and a custom `HighlightStyle` to
 *      `syntaxHighlighting` themselves.
 *
 * Class names are stable so that authors can also override them without
 * rebuilding the package.
 */
export const plantUmlHighlightStyle = HighlightStyle.define([
  { tag: highlightTags.keyword, class: "uml-cm-keyword" },
  { tag: highlightTags.controlKeyword, class: "uml-cm-control-keyword" },
  { tag: highlightTags.typeName, class: "uml-cm-type" },
  { tag: highlightTags.string, class: "uml-cm-string" },
  { tag: highlightTags.number, class: "uml-cm-number" },
  { tag: highlightTags.comment, class: "uml-cm-comment" },
  { tag: highlightTags.metaComment, class: "uml-cm-meta" },
  { tag: highlightTags.operator, class: "uml-cm-operator" },
  { tag: highlightTags.arrow, class: "uml-cm-arrow" },
  { tag: highlightTags.variableName, class: "uml-cm-identifier" },
  { tag: highlightTags.bracket, class: "uml-cm-bracket" },
  { tag: highlightTags.invalid, class: "uml-cm-invalid" },
]);

/**
 * Convenience extension that installs `plantUmlHighlightStyle` into the
 * editor. Mirrors what `language.plantUml()` does internally; exported
 * so consumers who construct their own language facet can still pull in
 * the default style.
 */
export const plantUmlHighlighting = (): Extension => syntaxHighlighting(plantUmlHighlightStyle);
