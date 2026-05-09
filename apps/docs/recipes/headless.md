# Headless API usage

`@uml-drawer/core` is fully usable without the React adapter. Drop down to the vanilla `createEditor` for static-site generators, server-side rendering, CLIs, or any context without React.

## SSR / Static generation

```ts
import { createEditor } from "@uml-drawer/core/editor";
import { JSDOM } from "jsdom"; // or any DOM polyfill

const dom = new JSDOM("<!doctype html><div id='host'></div>");
const host = dom.window.document.getElementById("host")!;

const editor = createEditor(host, { diagramType: "class" });
await editor.loadFromText(plantUmlSource);
const svg = editor.exportSvg({ themeStyleBlock });
editor.destroy();
```

`themeStyleBlock` materialises every `--uml-*` token as a literal value — see `buildThemeStyleBlock(tokens)` in `@uml-drawer/core/exporters`. Without it, the SVG references `var(--uml-…)` and only renders correctly inside a host that provides the contract.

## Bypass the editor

If you only need pure functions:

```ts
import { parsePlantUml } from "@uml-drawer/core/parser";
import { generatePlantUml } from "@uml-drawer/core/generator";
import { runAllValidators, adoptParserErrors } from "@uml-drawer/core/validators";
import { runAutoLayout } from "@uml-drawer/core/layout";
import { renderDiagram } from "@uml-drawer/core/renderer";
import { exportSvg, exportJson } from "@uml-drawer/core/exporters";

const { ast, errors: parserErrors } = parsePlantUml(source, { diagramType: "class" });
const { errors } = runAllValidators(ast, adoptParserErrors(parserErrors));

const layout = await runAutoLayout(ast); // returns { coordinates, engine }
const rendered = renderDiagram(ast, { coordinates: layout.coordinates });

const svg = exportSvg(ast, { coordinates: layout.coordinates });
const json = exportJson(ast);
const text = generatePlantUml(ast);
```

Each module is independently importable and `sideEffects: false`, so unused parts tree-shake out.

## CQRS without the editor

```ts
import { CommandBus, addNodeCommand } from "@uml-drawer/core/commands";
import { History } from "@uml-drawer/core/history";
import { createEmptyDiagram, uuidv7 } from "@uml-drawer/core/model";

const bus = new CommandBus(createEmptyDiagram("class"));
const history = new History(bus);

history.dispatch(addNodeCommand({ id: uuidv7(), kind: "class", label: "Foo" }));
history.dispatch(addNodeCommand({ id: uuidv7(), kind: "class", label: "Bar" }));
history.undo();

console.log(bus.getState().nodes); // [{ kind: "class", label: "Foo", … }]
```

Useful for CLI tools (e.g. converting `.umljson` between schema versions, generating diagrams from your codebase as a build step).
