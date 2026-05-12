# UML Drawer JS — установка и использование

Краткий гайд: установить, подключить, нарисовать первую диаграмму. Глубокая интеграция и тонкая настройка — в [`INTEGRATION.md`](./INTEGRATION.md), архитектурные решения — в [`docs/uml-drawer.md`](./docs/uml-drawer.md) и [`docs/adr/`](./docs/adr/).

## 1. Что это

Framework-agnostic TypeScript-библиотека для редактирования UML-диаграмм с двунаправленной синхронизацией визуала и PlantUML-DSL. Один AST — единственный источник правды; визуальные и текстовые правки сходятся в нём.

Поддерживаемые типы диаграмм (тип фиксируется при создании):

- **C4 · Context / Container / Component** — полный stdlib c4model.com (`Person`, `Person_Ext`, `System*`, `Container*`, `Component*`, `Boundary`-варианты).
- **Class** — классы, интерфейсы, abstract-классы, enum-литералы, generics, packages, per-end role / multiplicity / navigability.
- **Entity Relationship** — entities с PK / FK / NN-атрибутами в UML-IE-нотации, crow's-foot стрелки.
- **Sequence** — actor / lifeline / boundary / control / entity / database / queue / collections; activations; combined fragments (`alt` / `opt` / `loop` / `par` / `break` / `critical` / `ref`); notes; dividers; autonumber; self-messages; create / destroy.

## 2. Требования

- **Node.js 20 LTS**, **pnpm 9+** (для разработки).
- Бандлер с поддержкой ESM + динамических импортов: Vite, Next.js 14+, Webpack 5, Rollup, esbuild.
- **React 18+** — если используется `@uml-drawer/react`.
- **CodeMirror 6** peer-зависимости — если используется `@uml-drawer/codemirror-plantuml`.

## 3. Установка

### React-путь (рекомендуется)

```bash
pnpm add @uml-drawer/react @uml-drawer/core @uml-drawer/theme react react-dom
```

### Vanilla-путь (без React)

```bash
pnpm add @uml-drawer/core @uml-drawer/theme
```

### CodeMirror-интеграция (опционально, если нужна подсветка / диагностика PlantUML)

```bash
pnpm add @uml-drawer/codemirror-plantuml @uml-drawer/core \
  @codemirror/state @codemirror/view @codemirror/language \
  @codemirror/lint @codemirror/autocomplete
```

Что публикуется:

| Пакет                             | Когда нужен                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| `@uml-drawer/core`                | Всегда. AST + парсер + генератор + валидаторы + layout + рендерер + commands + history + exports. |
| `@uml-drawer/theme`               | Всегда. CSS-контракт `--uml-*` + нейтральные light / dark-дефолты.                                |
| `@uml-drawer/react`               | Если приложение на React 18+.                                                                     |
| `@uml-drawer/codemirror-plantuml` | Если нужна подсветка / диагностика / автокомплит PlantUML.                                        |

Все пакеты — ESM-only, TypeScript-strict, `sideEffects: false` (кроме CSS у `react` и `theme`).

## 4. Подключение темы

Один раз на входе приложения:

```ts
// main.tsx / index.ts
import "@uml-drawer/theme";
```

Контракт активируется на любом элементе с атрибутом `data-uml-host` (обычно — корень редактора, проставляется автоматически). Переключение режима — `data-theme="light" | "dark"` на этом же элементе. Без атрибута используется `prefers-color-scheme`.

Библиотека не пишет стили в `:root` и не загрязняет глобальный CSS хоста.

## 5. Первая диаграмма — React

```tsx
import { UmlEditor, Canvas, Palette, PropsPanel, TextEditor, Outline } from "@uml-drawer/react";
import "@uml-drawer/react/styles.css";

const initial = `@startuml
title Order Management

class Customer
class Order

Customer "1" --> "*" Order : places
@enduml
`;

export function App() {
  return (
    <UmlEditor diagramType="class" defaultValue={initial} theme="auto">
      <Palette />
      <Canvas />
      <PropsPanel />
      <TextEditor />
      <Outline />
    </UmlEditor>
  );
}
```

Что произойдёт:

- `<UmlEditor>` собирает один экземпляр `createEditor` и общую модель выделения.
- `<Palette>` показывает каталог узлов (включая Boundary как first-class элемент).
- `<Canvas>` монтирует SVG-рендерер и регистрирует pan / zoom / pointer / keyboard.
- `<PropsPanel>` редактирует selected node / edge / group — для class / ER / sequence есть специализированные суб-редакторы (`<ClassMembersEditor>`, `<EntityMembersEditor>`, `<FragmentEditor>`, `<NoteEditor>`, `<DividerEditor>`).
- `<TextEditor>` — синхронизованный PlantUML-вьюшка.
- `<Outline>` — древовидное оглавление.

Хост-контейнер должен иметь фиксированную высоту (canvas использует 100%).

### Designer / PlantUML в одной области (как в playground'e)

```tsx
import { UmlEditor, Canvas, Palette, PropsPanel, Tabs, TextEditor } from "@uml-drawer/react";

<UmlEditor diagramType="sequence" defaultValue={initial} layout={{ text: "hidden" }}>
  <Palette />
  <Tabs
    keepMounted
    tabsPosition="bottom"
    tabs={[
      { id: "designer", label: "Designer", content: <Canvas /> },
      { id: "plantuml", label: "PlantUML", content: <TextEditor /> },
    ]}
  />
  <PropsPanel />
</UmlEditor>;
```

`layout={{ text: "hidden" }}` гасит дефолтный `<TextEditor>`-слот; `keepMounted` сохраняет состояние неактивной вкладки.

### Контролируемый режим

```tsx
const [text, setText] = useState(initial);

<UmlEditor
  diagramType="class"
  value={text}
  onChange={(e) => setText(e.text)}
  onValidate={(errors) => console.log(errors)}
/>;
```

`onChange` срабатывает после каждой команды (включая undo / redo / import) с `{ text, ast, errors, command }`.

## 6. Первая диаграмма — Vanilla (без React)

```ts
import { createEditor } from "@uml-drawer/core/editor";
import "@uml-drawer/theme";

const host = document.getElementById("host")!;
const editor = createEditor(host, {
  diagramType: "class",
  theme: "auto",
  initialText: "@startuml\nclass Foo\nclass Bar\nFoo --> Bar\n@enduml\n",
  onChange: ({ text, errors }) => {
    console.log(text, errors.length);
  },
});

await editor.runAutoLayout();
const svg = editor.exportSvg();

// при размонтировании
editor.destroy();
```

Поверхность `EditorInstance` (см. `packages/core/src/editor/options.ts`):

```
loadFromText(text)            → Promise<EditorChangeEvent>
loadFromJson(text)            → ImportJsonResult
exportText() / exportSvg()    → string
exportPng(opts?)              → Promise<Blob>
exportJson(opts?)             → string
undo() / redo()               → boolean
runAutoLayout(opts?)          → Promise<void>
applyTheme("light"|"dark"|"auto")
dispatch(command)             → Diagram
getState() / getErrors()
centerView() / fitToView()    (выравнивание viewport'а)
bus / history / panZoom       (для продвинутых сценариев)
destroy()
```

## 7. CodeMirror — одной строкой

```ts
import { EditorView, basicSetup } from "codemirror";
import { plantUmlSupport } from "@uml-drawer/codemirror-plantuml";

new EditorView({
  parent: document.getElementById("text")!,
  doc: "@startuml\nclass Foo\n@enduml\n",
  extensions: [basicSetup, plantUmlSupport({ diagramType: "class" })],
});
```

Чтобы quick-fix-действия попадали в общий undo-стек редактора, прокинь `dispatch` и `getDiagram` — см. [`INTEGRATION.md` §7](./INTEGRATION.md).

## 8. Экспорт / импорт

```ts
const puml = editor.exportText(); // PlantUML с layout-аннотациями в комментариях
const svg = editor.exportSvg(); // standalone SVG
const png = await editor.exportPng(); // Blob — заливай через FormData
const json = editor.exportJson(); // .umljson — round-trip без потерь

// обратный путь
await editor.loadFromText(puml);
editor.loadFromJson(json);
```

Layout-координаты сохраняются в `' @drawer:meta {…}` PlantUML-комментариях — другие PlantUML-инструменты их игнорируют, а UML Drawer JS восстановит их при `loadFromText`.

## 9. Темизация и собственный скин

Скин — это CSS-файл с переопределением `--uml-*` под более специфичный селектор:

```css
.my-skin {
  --uml-accent: #7c3aed;
  --uml-bg: #1f1730;
  --uml-bg-elevated: #2a2240;
  --uml-node-border: #3b2e57;
}
```

```ts
document.body.classList.add("my-skin");
```

Полный список переменных — в `@uml-drawer/theme/tokens.json`. Категории: surface / text / border / semantic / node / edge / canvas / selection / typography / geometry / motion / shadow.

Правила скина (NFR):

- Никаких хардкодов цветов в `packages/*` — только токены.
- Любые glow / blur / scanline в скине обязаны быть отключены под `@media (prefers-reduced-motion: reduce)`.

Эталонный пример — `apps/playground/src/skins/cyber-topographic/`.

## 10. Перформанс и бандлер

- **ELK.js подгружается динамическим импортом** при первом вызове `runAutoLayout()`. Не делай статических импортов из `@uml-drawer/core/layout` в hot-path.
- Целевые бюджеты (проверяются в CI): core + react + ELK ≤ **500 KB gzip**; parse + regen < **50 ms**; **60 FPS** pan / zoom на 200 узлах.
- Tree-shaking работает: импортируй точечно (`@uml-drawer/core/exporters`, `@uml-drawer/core/model`), а не корневой бандл.

## 11. SSR / Next.js

`<UmlEditor>` — клиентский компонент:

```tsx
"use client";
import { UmlEditor } from "@uml-drawer/react";
```

или через `next/dynamic`:

```tsx
const UmlEditor = dynamic(() => import("@uml-drawer/react").then((m) => m.UmlEditor), {
  ssr: false,
});
```

CSS-файлы (`@uml-drawer/theme`, `@uml-drawer/react/styles.css`) безопасно импортируются в server-компонентах.

## 12. CQRS — добавить узел / связь программно

```ts
import { addNodeCommand, addEdgeCommand, addGroupCommand } from "@uml-drawer/core/commands";

const ast = editor.dispatch(addNodeCommand({ kind: "class", label: "Invoice" }));
const invoiceId = ast.nodes.at(-1)!.id;

editor.dispatch(addEdgeCommand({ source: invoiceId, target: "n_order", kind: "association" }));
editor.dispatch(addGroupCommand({ kind: "boundary", label: "Billing", children: [invoiceId] }));
```

Каждая команда попадает в undo-стек автоматически. Прямые мутации AST запрещены — иначе разъедется история и потенциальный CRDT-режим. Полный каталог команд — в [`INTEGRATION.md` §12](./INTEGRATION.md).

## 13. Чек-лист интеграции

- [ ] Установлены `@uml-drawer/core` + `@uml-drawer/theme` (+ `@uml-drawer/react` при необходимости).
- [ ] На входе приложения один раз импортирован `@uml-drawer/theme`.
- [ ] React: импортирован `@uml-drawer/react/styles.css`.
- [ ] Хост-элемент имеет фиксированную высоту.
- [ ] При SSR компонент помечен `"use client"` или загружен через `dynamic({ ssr: false })`.
- [ ] `runAutoLayout()` вызывается лениво (по кнопке / при импорте), а не на каждый ввод.
- [ ] При смене `diagramType` компонент пересоздаётся через `key`, а не мутируется.
- [ ] В vanilla-режиме перед размонтированием вызван `editor.destroy()`.

## 14. Где искать дальше

- [`INTEGRATION.md`](./INTEGRATION.md) — расширенная интеграция, темизация, CodeMirror quick-fix, отладка.
- [`docs/uml-drawer.md`](./docs/uml-drawer.md) — авторитетная SRS / SDD-спецификация (русский).
- [`docs/IMPLEMENTATION_PLAN.md`](./docs/IMPLEMENTATION_PLAN.md) — фазовый roadmap и changelog.
- [`docs/adr/`](./docs/adr/) — ADR'ы 0001–0010 (sequence layout, undo, PlantUML subset, CRDT-готовность, drill-down, AI, enum, class-edge endpoints, ER-attributes, full UML SD).
- `apps/docs/` — VitePress-сайт с пошаговыми гайдами по каждому типу диаграмм.
- `apps/playground/` — живой showcase под скином cyber-topographic.

## 15. Поддержка

- Issues: <https://github.com/Salvadore1987/uml-drawerjs/issues>
- Лицензия: [MIT](./LICENSE)
