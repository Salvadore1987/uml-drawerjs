import type {
  Completion,
  CompletionContext,
  CompletionResult,
  CompletionSource,
} from "@codemirror/autocomplete";
import { parsePlantUml } from "@uml-drawer/core/parser";
import type { Diagram, DiagramType } from "@uml-drawer/core/model";
import { typeSuggestionsFor } from "@uml-drawer/core/model";
import { snippetsFor } from "./snippets.js";

/**
 * Context-aware completion source. The MVP wires up four buckets:
 *
 *   1. **Snippets** — typical scaffolds for the current diagram type
 *      (see `snippets.ts`). Always offered.
 *   2. **Keywords** — universal markers + per-type keywords (e.g.
 *      `class`, `entity`, `Rel`). Offered while typing an identifier.
 *   3. **Node kinds** — diagram-type-specific kinds (e.g. `class` /
 *      `interface` for `class`, `Person` / `System` for C4). These
 *      double up with snippets but rank higher because they are exact
 *      label matches.
 *   4. **Existing alias / id references** — node aliases / ids parsed
 *      out of the current document so `Foo --> ▮` proposes the names
 *      already in scope.
 *
 * The source is pure — it does not mutate the AST, the parser, or any
 * downstream state. It can therefore be reused outside the editor for
 * "predict completions for this snapshot" tooling.
 */
export interface PlantUmlAutocompleteOptions {
  readonly diagramType: DiagramType;
  /**
   * Live AST accessor. When provided, identifier completions for `Foo
   * --> ▮` reflect the editor's actual state (post-commands), not the
   * just-parsed snapshot. Defaults to the parsed-now AST.
   */
  readonly getDiagram?: () => Diagram | null;
  /** Override id factory — used so completion-time parses are deterministic in tests. */
  readonly idFactory?: () => string;
  /**
   * Extra static completions appended to every result. Useful for
   * downstream packages that want to offer team-specific aliases.
   */
  readonly extraCompletions?: readonly Completion[];
}

const UNIVERSAL_KEYWORDS: Completion[] = [
  { label: "@startuml", type: "keyword", boost: 30 },
  { label: "@enduml", type: "keyword", boost: 30 },
  { label: "title", type: "keyword" },
  { label: "note", type: "keyword" },
  { label: "skinparam", type: "keyword" },
  { label: "hide", type: "keyword" },
  { label: "show", type: "keyword" },
];

const C4_KEYWORDS: Completion[] = [
  { label: "Person", type: "function" },
  { label: "Person_Ext", type: "function" },
  { label: "System", type: "function" },
  { label: "System_Ext", type: "function" },
  { label: "Rel", type: "function" },
  { label: "Boundary", type: "function" },
  { label: "System_Boundary", type: "function" },
];

const C4_CONTAINER_KEYWORDS: Completion[] = [
  { label: "Container", type: "function" },
  { label: "ContainerDb", type: "function" },
  { label: "Container_Boundary", type: "function" },
];

const C4_COMPONENT_KEYWORDS: Completion[] = [
  { label: "Component", type: "function" },
  { label: "ComponentDb", type: "function" },
];

const CLASS_KEYWORDS: Completion[] = [
  { label: "class", type: "keyword" },
  { label: "interface", type: "keyword" },
  { label: "abstract", type: "keyword" },
  { label: "enum", type: "keyword" },
];

const ER_KEYWORDS: Completion[] = [{ label: "entity", type: "keyword" }];

const SEQUENCE_KEYWORDS: Completion[] = [
  { label: "participant", type: "keyword" },
  { label: "actor", type: "keyword" },
  { label: "activate", type: "keyword" },
  { label: "deactivate", type: "keyword" },
  { label: "alt", type: "keyword" },
  { label: "else", type: "keyword" },
  { label: "opt", type: "keyword" },
  { label: "loop", type: "keyword" },
  { label: "end", type: "keyword" },
  { label: "return", type: "keyword" },
];

function keywordsFor(type: DiagramType): Completion[] {
  switch (type) {
    case "c4-context":
      return [...UNIVERSAL_KEYWORDS, ...C4_KEYWORDS];
    case "c4-container":
      return [...UNIVERSAL_KEYWORDS, ...C4_KEYWORDS, ...C4_CONTAINER_KEYWORDS];
    case "c4-component":
      return [
        ...UNIVERSAL_KEYWORDS,
        ...C4_KEYWORDS,
        ...C4_CONTAINER_KEYWORDS,
        ...C4_COMPONENT_KEYWORDS,
      ];
    case "class":
      return [...UNIVERSAL_KEYWORDS, ...CLASS_KEYWORDS];
    case "er":
      return [...UNIVERSAL_KEYWORDS, ...ER_KEYWORDS];
    case "sequence":
      return [...UNIVERSAL_KEYWORDS, ...SEQUENCE_KEYWORDS];
  }
}

/**
 * Build a completion source tailored to the diagram type. The result is
 * a single function — register it via `autocompletion({ override: [...] })`
 * or wire it through `LanguageSupport.languageData` if you wrap the
 * extension yourself.
 */
export function plantUmlCompletions(options: PlantUmlAutocompleteOptions): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const word = context.matchBefore(/[@\w_]*/u);
    if (!word) return null;
    if (word.from === word.to && !context.explicit) return null;

    const completions = collectCompletions(context, options, word.text);
    if (completions.length === 0) return null;

    return {
      from: word.from,
      to: word.to,
      options: completions,
      validFor: /^[\w@_]*$/u,
    };
  };
}

/**
 * Matches the cursor sitting in the *type* slot of a member line, i.e.
 * after the `:` separator on an attribute/column (or a method return type):
 *
 *   `* id : UUI▮`      `name: Str▮`      `+ amount : ▮`      `charge(): voi▮`
 *
 * Leading PK/FK markers (`*` / `+`) and class visibility glyphs
 * (`-` / `#` / `~`) are tolerated; an optional `(...)` covers method
 * signatures. The trailing `\w*` allows an empty partial (explicit trigger
 * right after the colon).
 */
const ATTRIBUTE_TYPE_POSITION = /^\s*[*+\-#~]?\s*[A-Za-z_]\w*\s*(?:\([^)]*\))?\s*:\s*\w*$/u;

/**
 * When the cursor is in attribute-type position, propose the diagram's type
 * vocabulary (SQL for ER, Java for class). Returns `null` when not in that
 * position or when the diagram type carries no typed attributes — callers
 * then fall back to the regular keyword/snippet/identifier buckets.
 */
function typeCompletionsFor(
  context: CompletionContext,
  options: PlantUmlAutocompleteOptions,
): Completion[] | null {
  const line = context.state.doc.lineAt(context.pos);
  const before = line.text.slice(0, context.pos - line.from);
  if (!ATTRIBUTE_TYPE_POSITION.test(before)) return null;

  const types = typeSuggestionsFor(options.diagramType);
  if (types.length === 0) return null;

  return types.map((label) => ({ label, type: "type", boost: 40 }));
}

function collectCompletions(
  context: CompletionContext,
  options: PlantUmlAutocompleteOptions,
  prefix: string,
): Completion[] {
  // Type position is exclusive — when the user is filling in a column/field
  // type we only want the type vocabulary, not keywords or aliases.
  const typeBucket = typeCompletionsFor(context, options);
  if (typeBucket) {
    if (options.extraCompletions) typeBucket.push(...options.extraCompletions);
    void prefix;
    return typeBucket;
  }

  const docText = context.state.doc.toString();
  const result: Completion[] = [];

  // 1. Snippets are always relevant — Tab through fields gets users a
  // skeleton fast even before they remember the exact macro name.
  for (const snippet of snippetsFor(options.diagramType)) result.push(snippet);

  // 2. Per-type keywords / kinds.
  for (const keyword of keywordsFor(options.diagramType)) result.push(keyword);

  // 3. Existing identifiers — parse the doc so we surface aliases the
  // user has already declared. Either source (live diagram or fresh parse)
  // is fine; live diagram avoids re-parsing when the editor is connected.
  const diagram = resolveDiagram(docText, options);
  if (diagram) {
    for (const ident of identifiersFor(diagram)) result.push(ident);
  }

  // 4. Caller-provided extras.
  if (options.extraCompletions) result.push(...options.extraCompletions);

  // Filter is delegated to CodeMirror's matcher; we just hand back the
  // superset and let it score against `prefix`. Fast-path empty prefix so
  // explicit-trigger completions still show everything.
  void prefix;
  return result;
}

function resolveDiagram(docText: string, options: PlantUmlAutocompleteOptions): Diagram | null {
  if (options.getDiagram) {
    const live = options.getDiagram();
    if (live) return live;
  }
  const parseOptions: Parameters<typeof parsePlantUml>[1] = {
    diagramType: options.diagramType,
  };
  if (options.idFactory) parseOptions.idFactory = options.idFactory;
  try {
    return parsePlantUml(docText, parseOptions).ast;
  } catch {
    return null;
  }
}

function identifiersFor(diagram: Diagram): Completion[] {
  const out: Completion[] = [];
  for (const node of diagram.nodes) {
    out.push({
      label: node.id,
      type: "variable",
      detail: detailFor(node.kind, node.label),
      boost: 20,
    });
  }
  for (const group of diagram.groups) {
    out.push({
      label: group.id,
      type: "namespace",
      detail: `${group.kind} group · ${group.label}`,
      boost: 10,
    });
  }
  return out;
}

function detailFor(kind: string, label: string): string {
  return label ? `${kind} · ${label}` : kind;
}
