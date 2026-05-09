# Интеграция и использование UML Drawer JS

Инструкция по подключению `@uml-drawer/*` в стороннее приложение. Для глубоких разделов (концепции AST, сценарии, API-референс) смотри сайт документации в `apps/docs` или [`docs/uml-drawer.md`](./docs/uml-drawer.md).

## 1. Что публикуется

| Пакет                             | Когда нужен                                                                                         |
| --------------------------------- | --------------------------------------------------------------------------------------------------- |
| `@uml-drawer/core`                | Всегда. AST + парсер + генератор + валидаторы + layout + рендерер + commands + history + exporters. |
| `@uml-drawer/theme`               | Всегда. CSS-контракт `--uml-*` + нейтральные light/dark-дефолты.                                    |
| `@uml-drawer/react`               | Если приложение на React 18+.                                                                       |
| `@uml-drawer/codemirror-plantuml` | Если нужна подсветка/диагностика/автокомплит PlantUML в текстовом редакторе.                        |

Все пакеты — ESM-only, `sideEffects: false` (кроме CSS у `react` и `theme`), TypeScript-strict.

## 2. Требования

- Node.js 20 LTS, pnpm 9+ (для разработки внутри монорепо).
- В целевом приложении: бандлер с поддержкой ESM и динамических импортов (Vite, Next.js 14+, Webpack 5, Rollup, esbuild).
- React 18+ (для `@uml-drawer/react`).
- CodeMirror 6 — peer-зависимости: `@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `@codemirror/lint`, `@codemirror/autocomplete`.

## 3. Установка

### React-путь (рекомендуется)

```bash
pnpm add @uml-drawer/react @uml-drawer/core @uml-drawer/theme react react-dom
```

### Vanilla-путь

```bash
pnpm add @uml-drawer/core @uml-drawer/theme
```

### CodeMirror (опционально)

```bash
pnpm add @uml-drawer/codemirror-plantuml @uml-drawer/core \
  @codemirror/state @codemirror/view @codemirror/language \
  @codemirror/lint @codemirror/autocomplete
```

## 4. Подключение темы

Один раз на входе приложения:

```ts
// main.tsx / index.ts
import "@uml-drawer/theme";
```

Контракт активируется на любом элементе с атрибутом `data-uml-host` (обычно — корень редактора, проставляется автоматически). Переключение режима — `data-theme="light" | "dark"` на этом же элементе. Без атрибута применяется `prefers-color-scheme`.

**Важно:** библиотека не пишет стили в `:root` и не загрязняет глобальный CSS хоста.

## 5. React: минимальный пример

```tsx
import { UmlEditor, Canvas, Palette, PropsPanel, TextEditor, Outline } from "@uml-drawer/react";
import "@uml-drawer/react/styles.css";

const initial = `@startuml
class Order
class Customer
Order --> Customer : owner
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

`<UmlEditor>` — это провайдер: он владеет одним экземпляром `createEditor` и общей моделью выделения. Дочерние компоненты безопасно работают до момента монтирования `<Canvas>` (хуки вернут `null`, не упадут).

### Поддерживаемые типы диаграмм

`diagramType` фиксируется на время жизни редактора:

```
"c4-context" | "c4-container" | "c4-component" | "class" | "er" | "sequence"
```

Для смены типа — пересоздай `<UmlEditor>` с новым `key`.

### Управляемый и неуправляемый режим

```tsx
// Неуправляемый
<UmlEditor diagramType="class" defaultValue={text} onChange={(e) => save(e.text)} />

// Управляемый
<UmlEditor diagramType="class" value={text} onChange={(e) => setText(e.text)} />
```

`onChange` срабатывает после каждой команды (включая undo/redo/import) и приходит с `{ text, ast, errors, command }`.

### Слоты и фильтрация палитры

```tsx
<UmlEditor
  diagramType="er"
  layout={{ palette: "left", props: "right", text: "hidden" }}
  paletteFilter={(item) => item.kind !== "note"}
>
  <Canvas />
  <Palette />
  <PropsPanel />
</UmlEditor>
```

### Доступ к редактору из своего UI

```tsx
import { useEditor, useDiagramErrors, useSelection } from "@uml-drawer/react";

function ToolbarExtras() {
  const editor = useEditor(); // EditorInstance | null
  const errors = useDiagramErrors(); // readonly DiagramError[]
  const selection = useSelection(); // SelectionController

  if (!editor) return null;

  return (
    <>
      <button onClick={() => editor.undo()}>Undo</button>
      <button onClick={() => editor.runAutoLayout()}>Auto-layout</button>
      <button onClick={async () => download(await editor.exportPng())}>PNG</button>
      <span>{errors.length} issues</span>
    </>
  );
}
```

## 6. Vanilla bootstrap

Без React — напрямую через `createEditor`:

```ts
import { createEditor } from "@uml-drawer/core/editor";
import "@uml-drawer/theme";

const host = document.getElementById("host")!;
const editor = createEditor(host, {
  diagramType: "class",
  theme: "auto",
  initialText: "@startuml\nclass Foo\n@enduml\n",
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
bus / history / panZoom       (для продвинутых сценариев)
destroy()
```

## 7. CodeMirror-интеграция

Одной строкой:

```ts
import { EditorView, basicSetup } from "codemirror";
import { plantUmlSupport } from "@uml-drawer/codemirror-plantuml";

new EditorView({
  parent: document.getElementById("text")!,
  doc: "@startuml\nclass Foo\n@enduml\n",
  extensions: [basicSetup, plantUmlSupport({ diagramType: "class" })],
});
```

Чтобы quick-fix-действия попадали в общий undo-стек редактора, прокинь `dispatch` и `getDiagram`:

```ts
import { createEditor } from "@uml-drawer/core/editor";
import { plantUmlSupport } from "@uml-drawer/codemirror-plantuml";

const editor = createEditor(canvasHost, { diagramType: "class" });

new EditorView({
  parent: textHost,
  extensions: [
    plantUmlSupport({
      diagramType: "class",
      dispatch: (cmd) => editor.dispatch(cmd),
      getDiagram: () => editor.getState(),
    }),
  ],
});
```

Тонкая настройка — `plantUml()`, `plantUmlLint()`, `plantUmlCompletions()` экспортируются отдельно. Класс-нейминг подсветки — `uml-cm-*`, перекрывается через `--uml-*` или скин.

## 8. Темизация и собственный скин

Скин — это CSS-файл с переопределением `--uml-*` в более специфичном селекторе:

```css
.my-skin {
  --uml-accent: #7c3aed;
  --uml-bg: #1f1730;
  --uml-bg-elevated: #2a2240;
  --uml-node-border: #3b2e57;
  /* ... */
}
```

```ts
document.body.classList.add("my-skin");
```

Полный список переменных — в `@uml-drawer/theme/tokens.json`. Категории: surface / text / border / semantic / node / edge / canvas / selection / typography / geometry / motion / shadow.

Правила скина:

- Никаких хардкодов цветов в `packages/*` — только токены.
- Любые glow / blur / scanlines в скине обязаны быть под `@media (prefers-reduced-motion: reduce)` отключены.
- Сама библиотека не возит анимаций, кроме плавного `--uml-transition-theme` при переключении темы.

Реальный пример скина — `apps/playground/src/skins/cyber-topographic/`.

## 9. Бандлер и производительность

- **ELK.js подгружается динамическим импортом** при первом вызове `runAutoLayout()`. Не делай статических импортов из `@uml-drawer/core/layout` в hot-path — потеряешь экономию.
- Целевые бюджеты (проверяются в CI): core + react + ELK ≤ 500 KB gzip; парсинг + регенерация PlantUML < 50 ms; 60 FPS pan/zoom на 200 узлах.
- Всё ESM. Если используешь Webpack < 5 или старые конфиги — потребуется `experiments.outputModule` / `type: "module"` в `package.json` целевого приложения.
- Tree-shaking работает: импортируй точечно (`@uml-drawer/core/exporters`, `@uml-drawer/core/model`), а не корневой бандл.

## 10. SSR / Next.js

`@uml-drawer/react` вешает SVG-рендерер в DOM хоста и подключает наблюдатели — это клиентская работа. В Next.js / Remix:

```tsx
"use client";
// ...
import { UmlEditor, Canvas } from "@uml-drawer/react";
```

или через `next/dynamic`:

```tsx
const UmlEditor = dynamic(() => import("@uml-drawer/react").then((m) => m.UmlEditor), {
  ssr: false,
});
```

CSS темы (`@uml-drawer/theme`, `@uml-drawer/react/styles.css`) можно импортировать в server-компонентах — они безопасны.

## 11. Экспорт и интеграция с бэкендом

```ts
const puml = editor.exportText(); // PlantUML с layout-аннотациями в комментариях
const svg = editor.exportSvg(); // standalone SVG
const png = await editor.exportPng(); // Blob — заливай через FormData
const json = editor.exportJson(); // .umljson — round-trip без потерь
```

Layout-координаты сохраняются в `' @drawer:meta {…}` PlantUML-комментариях — другие PlantUML-инструменты их игнорируют, а UML Drawer JS восстановит их при `loadFromText`.

## 12. Расширение через CQRS

Любая мутация AST идёт через команду. Свои команды диспатчатся через `editor.dispatch(...)` и автоматически попадают в undo-стек:

```ts
import { CreateNodeCommand } from "@uml-drawer/core/commands";

editor.dispatch(
  new CreateNodeCommand({
    diagramType: "class",
    kind: "class",
    label: "Invoice",
  }),
);
```

Прямые мутации AST запрещены — иначе разъедется история и потенциальный CRDT-режим.

## 13. Чек-лист интеграции

- [ ] Установлены `@uml-drawer/core` + `@uml-drawer/theme` (+ `@uml-drawer/react` при необходимости).
- [ ] На входе приложения один раз импортирован `@uml-drawer/theme`.
- [ ] React: импортирован `@uml-drawer/react/styles.css`.
- [ ] Хост-элемент имеет фиксированную высоту (canvas использует 100%).
- [ ] При SSR компонент помечен `"use client"` или загружен через `dynamic({ ssr: false })`.
- [ ] `runAutoLayout()` вызывается лениво (по кнопке / при импорте), а не на каждый ввод.
- [ ] При смене `diagramType` компонент пересоздаётся через `key`, а не мутируется.
- [ ] Перед размонтированием в vanilla-режиме вызван `editor.destroy()`.

## 14. Отладка

- Текст не парсится — посмотри `editor.getErrors()`: валидатор ходит уровнями `syntax → semantic → constraints → lint`, каждый возвращает `DiagramError` с диапазоном.
- Не отображаются узлы — убедись, что `<Canvas>` смонтирован и хост имеет ненулевой размер; до монтирования хуки возвращают `null`.
- ELK не грузится — проверь, что бандлер не блокирует динамический import (`@uml-drawer/core/layout/elk-loader`).
- Тема не переключается — атрибут `data-theme` нужно ставить на хост редактора, не на `:root`. В React это делает `theme` prop у `<UmlEditor>`.

## 15. Дальше

- `apps/docs/concepts/ast.md` — почему AST это единственный source of truth.
- `apps/docs/concepts/sync.md` — как двунаправленная синхронизация работает в обе стороны.
- `apps/docs/diagrams/<type>.md` — особенности и ограничения каждого типа.
- `apps/docs/api/` — ручной API-референс по всем пакетам.
- `apps/playground` — живой showcase с cyber-topographic-скином и slash-команд-каналом.
