# `@uml-drawer/core`

Framework-agnostic core: parser, AST model, generator, validators, layout, renderer, commands, history, exporters, vanilla `createEditor`. The hexagonal architecture keeps every module independently importable.

## Subpath imports

```ts
import { parsePlantUml } from "@uml-drawer/core/parser";
import { generatePlantUml } from "@uml-drawer/core/generator";
import { runAllValidators } from "@uml-drawer/core/validators";
import { runAutoLayout } from "@uml-drawer/core/layout";
import { renderDiagram, mountSvg } from "@uml-drawer/core/renderer";
import { CommandBus, addNodeCommand } from "@uml-drawer/core/commands";
import { History } from "@uml-drawer/core/history";
import {
  exportPuml,
  importPuml,
  exportJson,
  importJson,
  exportSvg,
  exportPng,
} from "@uml-drawer/core/exporters";
import { createEditor } from "@uml-drawer/core/editor";
import type { Diagram, DiagramNode, DiagramEdge, DiagramError } from "@uml-drawer/core/model";
```

## `/model`

Type-only barrel + the AST factories. Key exports:

```ts
type Diagram, DiagramNode, DiagramEdge, DiagramGroup, DiagramError, DiagramType, NodeKind, EdgeKind;
const SCHEMA_VERSION: string;
const diagramSchema: ZodSchema<Diagram>;
const diagramJsonSchema: object;          // JSON-Schema for tooling

uuidv7(): string;
isUuidv7(id: string): boolean;
createEmptyDiagram(type: DiagramType): Diagram;
cloneDiagram(d: Diagram): Diagram;
findNode(d: Diagram, id: string): DiagramNode | undefined;
findEdge(d: Diagram, id: string): DiagramEdge | undefined;
findGroup(d: Diagram, id: string): DiagramGroup | undefined;
getEdgesOfNode(d: Diagram, id: string): DiagramEdge[];
getOutgoingEdges(d: Diagram, id: string): DiagramEdge[];
getIncomingEdges(d: Diagram, id: string): DiagramEdge[];
getParentGroups(d: Diagram, id: string): DiagramGroup[];
parseDiagram(raw: unknown): { ok: true; diagram: Diagram } | { ok: false; issues: ZodIssue[] };
parseDiagramOrThrow(raw: unknown): Diagram;
```

## `/parser`

```ts
parsePlantUml(text: string, opts: { diagramType: DiagramType; diagramId?: string; idFactory?: () => string }): { ast: Diagram; errors: DiagramError[] };
SYNTAX_ERROR_CODES;       // SYNTAX_MALFORMED, SYNTAX_UNKNOWN_REFERENCE, SYNTAX_META, SYNTAX_MISSING_MARKER, SYNTAX_UNBALANCED_QUOTE
isMetaComment, parseMetaComment, formatMetaComment;
```

The parser is forgiving — unrecognised lines round-trip via `metadata.opaque`. See [ADR-0003](https://github.com/Salvadore1987/uml-drawerjs/blob/main/docs/adr/0003-plantuml-subset.md).

## `/generator`

```ts
generatePlantUml(d: Diagram): string;
aliasFromId(id: string): string;          // sanitisation rules
escapeStringLiteral(s: string): string;
formatDiagramMeta(d: Diagram): string | null;
```

Output is normalised: deterministic ordering, canonical arrow direction per edge kind, single-space separators.

## `/validators`

```ts
runAllValidators(d: Diagram, parserErrors?: readonly DiagramError[]): {
  errors: DiagramError[];
  bySeverity: { errors: DiagramError[]; warnings: DiagramError[]; infos: DiagramError[] };
};

validateSemantics(d: Diagram): DiagramError[];
validateConstraints(d: Diagram): DiagramError[];
validateLint(d: Diagram): DiagramError[];
adoptParserErrors(parserErrors: readonly DiagramError[]): DiagramError[];

// Quick-fix registry
attachQuickFixes(errors: readonly DiagramError[], d: Diagram, dispatch: (c: Command) => void): DiagramError[];
buildQuickFixCommand(d: Diagram, error: DiagramError): Command | null;
getQuickFix(code: string): QuickFixSuggestion | null;
```

## `/commands` + `/history`

```ts
class CommandBus {
  constructor(initial: Diagram);
  getState(): Diagram;
  setState(next: Diagram): void;
  dispatch(c: Command): Diagram;
  on(event: "before" | "after", listener): () => void;
}

class History {
  constructor(
    bus: CommandBus,
    opts?: { coalesceWindowMs?: number; coalescePredicate?: CoalescePredicate },
  );
  dispatch(c: Command): Diagram;
  undo(): Diagram | undefined;
  redo(): Diagram | undefined;
  canUndo(): boolean;
  canRedo(): boolean;
  clear(): void;
}

// Command factories — full list in concepts/commands.
(addNodeCommand,
  removeNodeCommand,
  moveNodeCommand,
  updateNodeCommand,
  addEdgeCommand,
  removeEdgeCommand,
  updateEdgeCommand,
  addGroupCommand,
  updateGroupCommand,
  removeGroupCommand,
  applyLayoutCommand,
  importTextCommand);
```

## `/layout`

```ts
runAutoLayout(d: Diagram, opts?: LayoutOptions): Promise<{ coordinates: LayoutCoordinates; engine: "elk" | "sequence" | "grid" }>;
layoutSequence(d: Diagram, opts?): { coordinates; engine: "sequence" };
layoutGrid(d: Diagram, opts?): { coordinates; engine: "grid" };
```

ELK is dynamically imported on first use. The fallback grid never throws.

## `/renderer`

```ts
renderDiagram(d: Diagram, opts?: RendererOptions): RenderedDiagram;
mountSvg(host: Element, vnode: VNode): { root: SVGElement; dispose(): void };
rerenderSvg(prev: MountResult, host: Element, vnode: VNode): MountResult;

createPanZoomController(host, opts?): PanZoomController;
attachKeyboardNavigation(host, opts): KeyboardNavigationController;
createSelectionModel(initial?): SelectionModel;
renderMinimap(d, opts);
summarizeForA11y(d): string;
```

## `/exporters`

```ts
exportPuml(d: Diagram): string;
importPuml(text: string, opts: ImportPumlOptions): Promise<ImportPumlResult>;
exportJson(d: Diagram, opts?): string;
importJson(text: string): ImportJsonResult;
exportSvg(d: Diagram, opts?): string;
exportPng(d: Diagram, opts?): Promise<Blob>;
buildThemeStyleBlock(tokens: Record<string, string>): string;
```

## `/editor`

```ts
createEditor(host: Element, opts: CreateEditorOptions): EditorInstance;

interface EditorInstance {
  loadFromText(text: string): Promise<EditorChangeEvent>;
  loadFromJson(text: string): ImportJsonResult;
  exportText(): string;
  exportSvg(opts?): string;
  exportPng(opts?): Promise<Blob>;
  exportJson(opts?): string;
  undo(): boolean;
  redo(): boolean;
  runAutoLayout(opts?): Promise<void>;
  applyTheme(theme: "dark" | "light" | "auto"): void;
  dispatch(c: Command): Diagram;
  getState(): Diagram;
  getErrors(): readonly DiagramError[];
  bus: CommandBus;
  history: History;
  panZoom: PanZoomController | null;
  destroy(): void;
}
```
