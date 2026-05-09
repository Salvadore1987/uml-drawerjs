import { LanguageSupport, StreamLanguage, type StreamParser } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { highlightTags, plantUmlHighlighting } from "./highlight.js";
import type { HighlightTagName } from "./highlight.js";

/**
 * Token names emitted by the stream tokenizer. They map 1:1 onto entries
 * in `highlightTags` so themes can target either the tag or the
 * `uml-cm-*` class — see `highlight.ts`.
 */
type Token = HighlightTagName;

interface TokenizerState {
  /** Inside a multi-line string literal? (Currently unused — PlantUML strings are single-line.) */
  inString: boolean;
  /** Are we on the first non-whitespace token of the current line? */
  startOfLine: boolean;
}

const KEYWORDS = new Set<string>([
  "title",
  "package",
  "namespace",
  "note",
  "left",
  "right",
  "of",
  "over",
  "as",
  "skinparam",
  "hide",
  "show",
  "scale",
  "autonumber",
  "activate",
  "deactivate",
  "alt",
  "else",
  "end",
  "opt",
  "loop",
  "par",
  "break",
  "critical",
  "group",
  "ref",
  "return",
]);

const CONTROL_KEYWORDS = new Set<string>(["@startuml", "@enduml"]);

const TYPE_KEYWORDS = new Set<string>([
  // Class
  "class",
  "interface",
  "abstract",
  "enum",
  // ER
  "entity",
  // Sequence
  "participant",
  "actor",
  "boundary",
  "control",
  "database",
  "queue",
  "collections",
  // C4 macros
  "Person",
  "Person_Ext",
  "System",
  "System_Ext",
  "System_Boundary",
  "Enterprise_Boundary",
  "Container",
  "ContainerDb",
  "Container_Boundary",
  "Component",
  "ComponentDb",
  "Boundary",
  "Rel",
  "Rel_U",
  "Rel_D",
  "Rel_L",
  "Rel_R",
  "Rel_Up",
  "Rel_Down",
  "Rel_Left",
  "Rel_Right",
  "BiRel",
]);

/**
 * Light, line-stable tokenizer for the PlantUML subset documented in
 * ADR-0003. Lezer is deferred — see ADR-0003 §Migration plan — so this
 * `StreamLanguage` parser provides highlighting + token-aware completion
 * without paying the cost of a full grammar.
 *
 * The tokenizer is intentionally permissive: anything it doesn't
 * recognise is dropped through as `null` (no styling) so users never see
 * red squiggles outside of the `lint` extension.
 */
const plantUmlStreamParser: StreamParser<TokenizerState> = {
  startState(): TokenizerState {
    return { inString: false, startOfLine: true };
  },
  token(stream, state): string | null {
    if (stream.sol()) {
      state.startOfLine = true;
    }

    if (stream.eatSpace()) {
      return null;
    }

    // Comments: `' …`. Everything until end-of-line.
    if (stream.peek() === "'") {
      stream.next();
      // Special: `' @drawer:meta {…}` is a meta comment.
      const rest = stream.match(/^\s*@drawer:meta\b/u, false);
      stream.skipToEnd();
      state.startOfLine = false;
      return tokenName(rest ? "metaComment" : "comment");
    }

    // String literals: simple double-quoted strings, single-line.
    if (stream.peek() === '"') {
      stream.next();
      while (!stream.eol()) {
        const ch = stream.next();
        if (ch === '"') {
          state.startOfLine = false;
          return tokenName("string");
        }
        if (ch === "\\" && !stream.eol()) {
          stream.next();
        }
      }
      // Unterminated string — mark as invalid so themes can highlight.
      state.startOfLine = false;
      return tokenName("invalid");
    }

    // Numbers — used in `' @drawer:meta {…}` payloads, skinparam values, …
    const numMatch = stream.match(/^-?\d+(?:\.\d+)?\b/u);
    if (numMatch) {
      state.startOfLine = false;
      return tokenName("number");
    }

    // Arrow operators (must be checked before generic operators so that
    // e.g. `..|>` is one token rather than `.. ` + `|>`).
    if (matchArrow(stream)) {
      state.startOfLine = false;
      return tokenName("arrow");
    }

    // Single-character operators / punctuation.
    if (stream.eat(/[(),:{}[\]<>|]/u)) {
      state.startOfLine = false;
      return tokenName("operator");
    }

    // Identifier / keyword. Allow PlantUML identifiers including underscores
    // and dots (the C4 `_Ext` suffix).
    const identMatch = stream.match(/^@?[A-Za-z_][A-Za-z0-9_]*/u);
    if (identMatch && Array.isArray(identMatch)) {
      const word = identMatch[0];
      const wasStartOfLine = state.startOfLine;
      state.startOfLine = false;

      if (CONTROL_KEYWORDS.has(word)) return tokenName("controlKeyword");
      if (TYPE_KEYWORDS.has(word)) return tokenName("typeName");
      if (KEYWORDS.has(word)) return tokenName("keyword");
      // Heuristic: an identifier that appears at the start of an arrow line
      // (e.g. `Foo --> Bar`) is rendered as a variable name. We can't know
      // for sure without a grammar, so style identifiers uniformly.
      void wasStartOfLine;
      return tokenName("variableName");
    }

    // Anything else — consume one char so the stream advances.
    stream.next();
    state.startOfLine = false;
    return null;
  },
  languageData: {
    commentTokens: { line: "'" },
    closeBrackets: { brackets: ["(", "[", "{", '"'] },
    indentOnInput: /^\s*(?:end|else)\b/u,
  },
};

function matchArrow(stream: {
  match: (regex: RegExp) => boolean | RegExpMatchArray | null;
}): boolean {
  // Order matters: longer arrows first.
  const arrowRegex =
    /^(?:<\|--|--\|>|\.\.\|>|<\|\.\.|<<--|-->>|\|\|--\|\||\|\|--o\{|\}o--\|\||\}o--o\{|<<\.\.|\.\.>>|<--|-->|<\.\.|\.\.>|--|<-|->|<\.|\.>|\*--|--\*|o--|--o)/u;
  const matched = stream.match(arrowRegex);
  return matched !== null && matched !== false;
}

function tokenName(name: Token): string {
  // StreamLanguage matches token strings against tag names. We keep the
  // token names identical to entries in `highlightTags` so a single
  // mapping lookup wires highlighting end-to-end.
  void highlightTags;
  return name;
}

/**
 * The PlantUML language facet — the entry point most consumers will use:
 *
 *   import { plantUml } from "@uml-drawer/codemirror-plantuml";
 *   const view = new EditorView({ extensions: [plantUml()] });
 *
 * Returns a `LanguageSupport` so callers can pass it to `EditorState`.
 */
export const plantUmlLanguage = StreamLanguage.define({
  ...plantUmlStreamParser,
  // `tokenTable` lets StreamLanguage map token-name strings emitted by
  // `token()` onto Lezer highlight tags. Without it, the StreamLanguage
  // would default to `Tag.define()` per name and our `HighlightStyle`
  // would not match.
  tokenTable: {
    keyword: highlightTags.keyword,
    controlKeyword: highlightTags.controlKeyword,
    typeName: highlightTags.typeName,
    string: highlightTags.string,
    number: highlightTags.number,
    comment: highlightTags.comment,
    metaComment: highlightTags.metaComment,
    operator: highlightTags.operator,
    arrow: highlightTags.arrow,
    variableName: highlightTags.variableName,
    bracket: highlightTags.bracket,
    invalid: highlightTags.invalid,
  },
});

/**
 * Convenience factory. Bundles the language with the default highlight
 * style so a simple `extensions: [plantUml()]` works out of the box.
 */
export function plantUml(): LanguageSupport {
  return new LanguageSupport(plantUmlLanguage, [plantUmlHighlighting() as Extension]);
}
