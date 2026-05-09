import { snippetCompletion } from "@codemirror/autocomplete";
import type { Completion } from "@codemirror/autocomplete";
import type { DiagramType } from "@uml-drawer/core/model";

/**
 * Snippet completions for the typical PlantUML constructs each diagram
 * type supports. Templates use CodeMirror's `${name}` placeholder syntax
 * — Tab moves between fields, Esc commits.
 *
 * Each snippet declares a `section` so the autocomplete popup groups
 * them visually (CodeMirror sorts by `boost`, then by section, then by
 * label).
 */
const SECTION = "Snippets";

const COMMON_HEADER = snippetCompletion("@startuml ${title}\n\n${}\n\n@enduml", {
  label: "@startuml",
  detail: "PlantUML document scaffold",
  type: "keyword",
  boost: 50,
  section: SECTION,
});

const COMMON_TITLE = snippetCompletion("title ${Untitled}", {
  label: "title",
  detail: "Document title",
  type: "keyword",
  section: SECTION,
});

const COMMON_NOTE = snippetCompletion("note ${left} of ${target}: ${text}", {
  label: "note",
  detail: "Standalone note",
  type: "keyword",
  section: SECTION,
});

const C4_CONTEXT_SNIPPETS: Completion[] = [
  snippetCompletion('Person(${alias}, "${Label}", "${Description}")', {
    label: "Person",
    detail: "Person actor",
    type: "function",
    section: SECTION,
  }),
  snippetCompletion('System(${alias}, "${Label}", "${Description}")', {
    label: "System",
    detail: "System (in-scope)",
    type: "function",
    section: SECTION,
  }),
  snippetCompletion('System_Ext(${alias}, "${Label}", "${Description}")', {
    label: "System_Ext",
    detail: "External system",
    type: "function",
    section: SECTION,
  }),
  snippetCompletion('Rel(${from}, ${to}, "${Label}", "${Tech}")', {
    label: "Rel",
    detail: "Relationship",
    type: "function",
    section: SECTION,
  }),
];

const C4_CONTAINER_SNIPPETS: Completion[] = [
  ...C4_CONTEXT_SNIPPETS,
  snippetCompletion('Container(${alias}, "${Label}", "${Tech}", "${Description}")', {
    label: "Container",
    detail: "Container",
    type: "function",
    section: SECTION,
  }),
  snippetCompletion('ContainerDb(${alias}, "${Label}", "${Tech}", "${Description}")', {
    label: "ContainerDb",
    detail: "Database container",
    type: "function",
    section: SECTION,
  }),
  snippetCompletion('System_Boundary(${alias}, "${Label}") {\n\t${}\n}', {
    label: "System_Boundary",
    detail: "Boundary group",
    type: "function",
    section: SECTION,
  }),
];

const C4_COMPONENT_SNIPPETS: Completion[] = [
  ...C4_CONTAINER_SNIPPETS,
  snippetCompletion('Component(${alias}, "${Label}", "${Tech}", "${Description}")', {
    label: "Component",
    detail: "Component",
    type: "function",
    section: SECTION,
  }),
  snippetCompletion('ComponentDb(${alias}, "${Label}", "${Tech}", "${Description}")', {
    label: "ComponentDb",
    detail: "Database component",
    type: "function",
    section: SECTION,
  }),
];

const CLASS_SNIPPETS: Completion[] = [
  snippetCompletion("class ${Name}", {
    label: "class",
    detail: "Class declaration",
    type: "keyword",
    section: SECTION,
  }),
  snippetCompletion("interface ${Name}", {
    label: "interface",
    detail: "Interface declaration",
    type: "keyword",
    section: SECTION,
  }),
  snippetCompletion("abstract class ${Name}", {
    label: "abstract class",
    detail: "Abstract class declaration",
    type: "keyword",
    section: SECTION,
  }),
  snippetCompletion("enum ${Name}", {
    label: "enum",
    detail: "Enum declaration",
    type: "keyword",
    section: SECTION,
  }),
  snippetCompletion("${Source} --> ${Target} : ${label}", {
    label: "association",
    detail: "Association",
    type: "constant",
    section: SECTION,
  }),
  snippetCompletion("${Child} --|> ${Parent}", {
    label: "inheritance",
    detail: "Inheritance",
    type: "constant",
    section: SECTION,
  }),
  snippetCompletion("${Class} ..|> ${Interface}", {
    label: "realization",
    detail: "Realization (implements)",
    type: "constant",
    section: SECTION,
  }),
];

const ER_SNIPPETS: Completion[] = [
  snippetCompletion("entity ${Name}", {
    label: "entity",
    detail: "ER entity",
    type: "keyword",
    section: SECTION,
  }),
  snippetCompletion("${A} ||--|| ${B} : ${label}", {
    label: "1 — 1",
    detail: "One-to-one relationship",
    type: "constant",
    section: SECTION,
  }),
  snippetCompletion("${A} ||--o{ ${B} : ${label}", {
    label: "1 — many",
    detail: "One-to-many relationship",
    type: "constant",
    section: SECTION,
  }),
  snippetCompletion("${A} }o--o{ ${B} : ${label}", {
    label: "many — many",
    detail: "Many-to-many relationship",
    type: "constant",
    section: SECTION,
  }),
];

const SEQUENCE_SNIPPETS: Completion[] = [
  snippetCompletion('participant "${Name}" as ${alias}', {
    label: "participant",
    detail: "Sequence participant",
    type: "keyword",
    section: SECTION,
  }),
  snippetCompletion("actor ${Name}", {
    label: "actor",
    detail: "Sequence actor",
    type: "keyword",
    section: SECTION,
  }),
  snippetCompletion("${From} -> ${To} : ${message}", {
    label: "sync message",
    detail: "Synchronous call",
    type: "constant",
    section: SECTION,
  }),
  snippetCompletion("${From} ->> ${To} : ${message}", {
    label: "async message",
    detail: "Asynchronous call",
    type: "constant",
    section: SECTION,
  }),
  snippetCompletion("${From} --> ${To} : ${return}", {
    label: "return",
    detail: "Return message",
    type: "constant",
    section: SECTION,
  }),
];

/**
 * Snippet table keyed by diagram type. The autocomplete source picks the
 * relevant entry based on the editor's `diagramType`.
 */
export const SNIPPETS_BY_DIAGRAM: Record<DiagramType, Completion[]> = {
  "c4-context": [COMMON_HEADER, COMMON_TITLE, COMMON_NOTE, ...C4_CONTEXT_SNIPPETS],
  "c4-container": [COMMON_HEADER, COMMON_TITLE, COMMON_NOTE, ...C4_CONTAINER_SNIPPETS],
  "c4-component": [COMMON_HEADER, COMMON_TITLE, COMMON_NOTE, ...C4_COMPONENT_SNIPPETS],
  class: [COMMON_HEADER, COMMON_TITLE, COMMON_NOTE, ...CLASS_SNIPPETS],
  er: [COMMON_HEADER, COMMON_TITLE, COMMON_NOTE, ...ER_SNIPPETS],
  sequence: [COMMON_HEADER, COMMON_TITLE, COMMON_NOTE, ...SEQUENCE_SNIPPETS],
};

/** Returns all snippets registered for `type`. Stable order. */
export function snippetsFor(type: DiagramType): Completion[] {
  return SNIPPETS_BY_DIAGRAM[type];
}
