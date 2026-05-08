# UML Drawer JS

## Overview

JavaScript/TypeScript библиотека графического редактора UML-диаграмм с двунаправленной синхронизацией между визуальной диаграммой и PlantUML-совместимым DSL. Поддерживает 5 типов диаграмм: C4 (Context, Container, Component), Entity Relationship, Class, Sequence. Поставляется как framework-agnostic ядро + React-адаптер, публикуется в npm под MIT.

Основная ценность: пользователи могут одинаково удобно работать с диаграммой как графически (drag&drop, редактирование свойств), так и текстово (PlantUML), причём оба представления остаются синхронизированными в реальном времени через единый AST как источник правды.

**Дизайн-нейтральность.** Библиотека поставляется design-agnostic — компоненты, SVG-рендерер и React-адаптер не несут бренд-эстетики. Тематизация осуществляется через документированный контракт CSS-переменных в namespace `--uml-*` с нейтральными дефолтами (системные шрифты, neutral-палитра, light/dark через `data-theme` на host-контейнере). Конкретные визуальные стили (например, cyber-topographic из `docs/design/02-cyber-topographic.html`) реализуются как отдельные скины **поверх** библиотеки и демонстрируются исключительно в `apps/playground` после реализации ядра.

## Requirements

### Functional Requirements

1. **Поддерживаемые типы диаграмм**: C4 Context, C4 Container, C4 Component, Class Diagram, Entity Relationship Diagram, Sequence Diagram. Тип фиксируется при создании диаграммы; смешивать типы на одном холсте нельзя.
2. **Категоризованная палитра компонентов**: компоненты в палитре сгруппированы по типу диаграммы — для C4-диаграмм отображаются только C4-компоненты (Person, System, Container, Component, Boundary и т.д.), для ER — только Entity/Attribute/Relationship и т.д.
3. **Двунаправленная синхронизация**: AST как единственный источник правды. Изменения в визуальном редакторе применяются к AST и регенерируют PlantUML-текст; правки в текстовом редакторе парсятся в AST и обновляют визуал.
4. **Drag&drop из палитры**: пользователь перетаскивает компоненты из палитры на холст. Компоненты ограничены типом диаграммы.
5. **Редактирование связей**: рисование стрелок/связей мышью с прилипанием к точкам узлов. Тип связи валидируется по типу узлов (например, в ER связи только Entity↔Entity).
6. **Панель свойств**: при выделении элемента отображается панель с его свойствами (имя, стереотип, атрибуты, операции, видимость, описание, цвет/стиль).
7. **Auto-layout (ELK.js)**: автоматическая раскладка по кнопке и при импорте текста, без сохранённых позиций. Использует ELK Layered для иерархических диаграмм, поддержка вложенных групп для C4.
8. **Экспорт**: PlantUML (.puml), SVG, PNG, нативный JSON-формат проекта (AST + позиции + кастомные стили).
9. **Импорт**: PlantUML-текст с автоматической раскладкой; нативный JSON.
10. **Undo/Redo**: история изменений с Cmd/Ctrl+Z и Cmd/Ctrl+Shift+Z.
11. **Zoom/Pan/Minimap**: масштабирование колесом, перемещение холста, мини-карта в углу для навигации по большим диаграммам.
12. **Темы и кастомные стили**: библиотека предоставляет theming contract — документированный набор CSS-переменных в namespace `--uml-*` с нейтральными дефолтами; светлая/тёмная тема переключается через `data-theme` на host-контейнере виджета. Потребители подключают свои скины (или один из опциональных showcase-скинов из `apps/playground`) переопределением переменных контракта. Никакие бренд-цвета, бренд-шрифты или декоративные эффекты не зашиты в компоненты или рендерер.
13. **Валидация**:
    - Синтаксические ошибки в текстовом режиме с подсветкой и маркерами.
    - Семантические ошибки модели (связь на несуществующий элемент, пустые имена, дубликаты ID).
    - Ограничения типов связей (например, в C4 Container не может содержать Component на уровне выше).
    - Linter качества: предупреждения о неиспользуемых элементах, циклических зависимостях, дубликатах имён.

### Non-Functional Requirements

- **Производительность**: плавная работа на диаграммах до 200 узлов (60 FPS pan/zoom), парсинг и регенерация текста <50 мс на типичной диаграмме.
- **Размер бандла**: ядро + React-адаптер + ELK ≤ 500 KB gzip; ELK подключается лениво (dynamic import).
- **Браузеры**: evergreen (последние 2 версии Chrome, Firefox, Safari, Edge). ES2022 baseline, без legacy polyfills.
- **TypeScript-friendly**: полные типы, declaration files в дистрибутиве, строгий strict mode.
- **Tree-shakeable**: ESM с `sideEffects: false`, чтобы пользователи могли подключать только нужное.
- **Доступность**: keyboard navigation по холсту, ARIA-атрибуты на элементах палитры/панелей, screen reader-friendly текстовый режим.
- **Лицензия**: MIT, публикация в npm.
- **Дизайн-нейтральность (design-agnostic)**: компоненты ядра и React-адаптера несут только структурный CSS (layout, sizing, transitions для affordance) и обращаются к стилям исключительно через namespace `--uml-*`. Дефолтная тема — нейтральная (системные шрифты, neutral-палитра); тёмная/светлая переключаются через `data-theme` на корневом контейнере виджета без пересборки React-дерева. Поддерживается `prefers-color-scheme` для автоматического выбора темы и `prefers-reduced-motion` для отключения анимаций. Любая бренд-эстетика — задача потребителя или опционального скина; референс `docs/design/02-cyber-topographic.html` воспроизводится только в `apps/playground` как showcase, не является требованием к компонентам.

## Architecture

### High-Level Design

Гексагональная архитектура с чётким разделением:

```
+-------------------------------------------------------------+
|                     React Adapter (UI)                      |
|   <UmlEditor /> <Palette /> <Canvas /> <PropsPanel />       |
+-------------------------------------------------------------+
                            |
+-------------------------------------------------------------+
|                  Framework-Agnostic Core                    |
|  +------------+  +------------+  +-------------+  +------+  |
|  | DSL Parser |  | AST Model  |  | Generator   |  | Diff |  |
|  +------------+  +------------+  +-------------+  +------+  |
|  +------------+  +------------+  +-------------+            |
|  | Validators |  | Layout     |  | Command Bus |            |
|  | (lint)     |  | (ELK)      |  | (undo/redo) |            |
|  +------------+  +------------+  +-------------+            |
|  +------------+  +------------+                             |
|  | SVG        |  | Exporters  |                             |
|  | Renderer   |  | (puml/svg/ |                             |
|  |            |  |  png/json) |                             |
|  +------------+  +------------+                             |
+-------------------------------------------------------------+
```

**Принцип двунаправленной синхронизации**:

```
        Visual Edit                       Text Edit
            |                                  |
            v                                  v
   +-----------------+               +-----------------+
   |  Visual Action  |               |  Text Change    |
   |  (drag, props)  |               |  (typing)       |
   +--------+--------+               +--------+--------+
            |                                  |
            v                                  v
   +-----------------+               +-----------------+
   |  Command (CQRS) | <-----+ +---> |  Incremental    |
   |  Apply to AST   |       | |     |  Parser (Lezer) |
   +--------+--------+       | |     +--------+--------+
            |                | |              |
            +----------+-----+-+--------------+
                       v
              +-----------------+
              |   AST (Single   |
              |  Source of      |
              |     Truth)      |
              +--------+--------+
                       |
            +----------+----------+
            |                     |
            v                     v
   +-----------------+   +-----------------+
   | Generator       |   | Layout (ELK)    |
   | AST -> PlantUML |   | + SVG Renderer  |
   +-----------------+   +-----------------+
```

### Technology Stack

- **Язык**: TypeScript 5.x (strict mode).
- **Сборка**: Vite (library mode) + pnpm workspaces.
- **Тесты**: Vitest (unit/snapshot) + Playwright (E2E + visual regression).
- **Парсер DSL**: Lezer (генератор парсеров от CodeMirror) — даёт инкрементальный парсинг и интеграцию с подсветкой.
- **Текстовый редактор**: CodeMirror 6 с кастомной грамматикой PlantUML.
- **Layout**: ELK.js (Eclipse Layout Kernel) для всех типов кроме Sequence; для Sequence — собственный простой алгоритм (вертикальные lifelines + временная ось).
- **Рендеринг**: SVG через D3-подобный декларативный слой (без зависимости от D3 напрямую — кастомная мини-библиотека).
- **State management в ядре**: zustand или внутренний CQRS-store без зависимостей.
- **Экспорт PNG**: рендер SVG в Canvas через `<foreignObject>` + `canvas.toBlob()`.
- **Стилизация**: CSS-only theming contract в namespace `--uml-*` с нейтральными дефолтами; никакой CSS-in-JS, никаких бренд-цветов в коде. Скины — отдельные CSS-файлы поверх контракта, поставляются вне ядра.
- **React-адаптер**: React 18+, отдельный пакет.

### Component Overview

**Монорепо (pnpm workspaces)**:

- `packages/core` — framework-agnostic ядро.
  - `parser/` — Lezer-грамматика PlantUML, парсер в AST.
  - `model/` — AST типы и операции (immutable).
  - `generator/` — AST → PlantUML текст.
  - `validators/` — синтаксические/семантические/lint-валидаторы.
  - `layout/` — обёртка над ELK + кастомный sequence layout.
  - `renderer/` — SVG-рендерер диаграмм.
  - `commands/` — CQRS-команды (AddNode, RemoveNode, MoveNode, Connect, ChangeProp...).
  - `history/` — undo/redo стек на основе команд.
  - `exporters/` — экспорт в puml/svg/png/json.
  - `editor/` — bootstrap-функция `createEditor(host, options)` для vanilla.
- `packages/react` — React-адаптер с компонентами `<UmlEditor>`, `<Canvas>`, `<Palette>`, `<PropsPanel>`, `<TextEditor>`.
- `packages/codemirror-plantuml` — CodeMirror 6 расширение для PlantUML (подсветка, autocomplete, маркеры ошибок).
- `packages/theme` — design-agnostic theming contract: namespace `--uml-*`, нейтральные дефолты для light/dark тем, поддержка `data-theme` на host-контейнере, `prefers-color-scheme` авто-detect и `prefers-reduced-motion` overrides. `tokens.json` — машиночитаемая декларация контракта. Бренд-эстетика отсутствует. Подключается как `@uml-drawer/theme/contract.css`.
- `apps/playground` — showcase-приложение и visual regression bed. Демонстрирует, что theming contract библиотеки достаточен для тяжело-стилизованной темы: содержит cyber-topographic скин в `apps/playground/src/skins/cyber-topographic/` и собирает поверх скина полный layout шаблона `02-cyber-topographic.html` (topbar, anchors-tree, canvas с HUD, command channel, statusbar). Скин реализуется ПОСЛЕ готовности библиотеки и не входит в её npm-пакеты.

## Data Model

### AST (упрощённо)

```typescript
type Diagram = {
  id: string;
  type: 'c4-context' | 'c4-container' | 'c4-component'
      | 'class' | 'er' | 'sequence';
  title?: string;
  nodes: Node[];
  edges: Edge[];
  groups: Group[];   // для C4: Boundary, для Class: Package
  styles?: StyleMap; // кастомные стили по id
  metadata: {
    schemaVersion: string;
    layoutOverrides?: Record<string, { x: number; y: number }>;
  };
};

type Node = {
  id: string;
  kind: NodeKind;          // 'class', 'entity', 'container', 'actor', 'lifeline'...
  label: string;
  stereotype?: string;
  attributes?: Attribute[]; // для Class/ER
  operations?: Operation[]; // для Class
  technology?: string;      // для C4
  description?: string;
  style?: NodeStyle;
};

type Edge = {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;          // 'association', 'inheritance', 'composition',
                           // 'one-to-many', 'sync-call', 'async-call'...
  label?: string;
  cardinality?: { source?: string; target?: string }; // для ER
  style?: EdgeStyle;
};

type Group = {
  id: string;
  kind: 'boundary' | 'package' | 'system';
  label: string;
  children: string[];      // ids of nodes/groups
};
```

### Хранение

Источник правды — AST в памяти. Персистентность — на стороне клиента библиотеки (библиотека сама не хранит, предоставляет API сохранения/загрузки). Форматы:

- `.puml` — PlantUML текст; позиции и стили закодированы в специальных аннотациях `' @drawer:meta {...}` на уровне комментариев (игнорируются другими PlantUML-рендерерами).
- `.umljson` — нативный JSON-формат, полный AST + layoutOverrides + styles.

## API Design

### Vanilla JS API (ядро)

```typescript
import { createEditor } from '@uml-drawer/core';

const editor = createEditor(document.getElementById('host'), {
  diagramType: 'class',
  initialText: '@startuml\nclass Foo\n@enduml',
  theme: 'light',
  onChange: (state) => { /* state: { text, ast, errors } */ },
});

editor.loadFromText(plantUmlText);
editor.loadFromJson(json);
editor.exportText();        // string
editor.exportSvg();         // string
editor.exportPng();         // Promise<Blob>
editor.exportJson();        // object
editor.undo();
editor.redo();
editor.runAutoLayout();
editor.applyTheme('dark');
editor.destroy();
```

### React API

```tsx
import { UmlEditor } from '@uml-drawer/react';

<UmlEditor
  diagramType="c4-container"
  value={text}                      // controlled или
  defaultValue={text}               // uncontrolled
  onChange={(state) => setText(state.text)}
  onValidate={(errors) => ...}
  theme="light"
  layout={{ palette: 'left', props: 'right', text: 'bottom-split' }}
  paletteFilter={(component) => true}
/>
```

### Команды (CQRS)

Все мутации проходят через команды для поддержки undo/redo:

| Command | Description |
|---------|-------------|
| `AddNodeCommand` | Добавить узел с типом, лейблом и позицией |
| `RemoveNodeCommand` | Удалить узел и все связанные edges |
| `MoveNodeCommand` | Изменить позицию (для layout overrides) |
| `UpdateNodeCommand` | Изменить свойства узла |
| `AddEdgeCommand` | Создать связь между узлами |
| `RemoveEdgeCommand` | Удалить связь |
| `UpdateEdgeCommand` | Изменить тип/label/cardinality |
| `GroupCommand` | Создать/изменить группу/boundary |
| `ApplyLayoutCommand` | Применить ELK layout |
| `ImportTextCommand` | Заменить весь AST из текста |

## UI Design

Раздел разделён на нормативную часть (требования к библиотеке — theming contract) и информативную (описание единственного showcase-скина для playground).

### Library Theming Contract (нормативно)

Библиотека предоставляет тематизацию ИСКЛЮЧИТЕЛЬНО через документированный набор CSS-переменных в namespace `--uml-*`. Никакие цвета, шрифты, тени, градиенты, фоновые изображения и декоративные эффекты не зашиты в компоненты, SVG-рендерер или React-адаптер. Все стили — структурные (layout, sizing, transitions для affordance) либо ссылаются на переменные контракта.

**Принципы:**

- Переменные применяются на корневом контейнере виджета (host-контейнере), а не глобально на `:root`, чтобы не конфликтовать с хост-приложением.
- Светлая/тёмная тема переключается через `data-theme="light" | "dark"` на корневом контейнере без пересборки React-дерева; transition 0.2–0.4s на `background` / `color`.
- При отсутствии явного `data-theme` тема выбирается через `prefers-color-scheme`.
- Все glow/blur/animation эффекты — на стороне скина, не библиотеки. Если скин их использует — он обязан учитывать `prefers-reduced-motion: reduce`.
- Дефолты — нейтральная палитра (нейтральные серые/синие, без бренд-акцентов) и системные шрифты (`system-ui, sans-serif` для текста, `ui-monospace, monospace` для текстового редактора). Дефолты не должны выглядеть «фирменно».

**Контракт CSS-переменных** (минимальный набор; полный список фиксируется в `tokens.json` пакета `@uml-drawer/theme` и в API-reference):

| Группа | Переменные | Назначение |
|--------|------------|------------|
| Поверхности | `--uml-bg`, `--uml-surface`, `--uml-surface-overlay` | Фоны виджета / панелей / popover |
| Текст | `--uml-text`, `--uml-text-muted`, `--uml-text-subtle` | Основной/вторичный/третичный текст |
| Линии | `--uml-border`, `--uml-border-strong` | Границы и разделители |
| Семантика | `--uml-accent`, `--uml-accent-fg`, `--uml-success`, `--uml-warning`, `--uml-danger`, `--uml-info` | Акцент CTA + статусные цвета |
| Узлы | `--uml-node-bg`, `--uml-node-border`, `--uml-node-text` | Дефолтное оформление узла; типы узлов могут переопределяться скином через CSS-классы вида `.uml-node--container` |
| Связи | `--uml-edge-stroke`, `--uml-edge-text` | Стрелки и подписи на них |
| Холст | `--uml-canvas-bg`, `--uml-canvas-grid` | Фон и сетка холста |
| Выделение | `--uml-selection-fg`, `--uml-selection-bg`, `--uml-selection-ring` | Селекшн-индикация |
| Шрифты | `--uml-font-sans`, `--uml-font-mono` | Семейства шрифтов |
| Радиусы/тени | `--uml-radius`, `--uml-radius-sm`, `--uml-shadow`, `--uml-shadow-sm` | Базовые декоративные примитивы |

Скины отвечают за то, чтобы переопределить эти переменные согласованно. Библиотека не знает имён скинов и не содержит их CSS-файлов в своих npm-пакетах. Если скин обнаруживает, что для воспроизведения целевого визуала контракта недостаточно — это сигнал расширить контракт; решение фиксируется ADR-ом и попадает в новую minor-версию `@uml-drawer/theme`.

### Layout компонентов библиотеки

Библиотечный `<UmlEditor>` принимает prop `layout` для расположения панелей (`palette`, `props`, `text`); их относительные пропорции — структурный CSS, не часть скина. Любая обёртка (топбар, статусбар, командный канал) — забота приложения-потребителя; в библиотеке эти элементы либо отсутствуют, либо предоставляются как опциональные headless-компоненты с минимальным структурным CSS.

### Playground Showcase Design (Cyber-Topographic) (информативно)

> Этот раздел описывает **один пример** скина и UI-композиции `apps/playground`. Он **не** является требованием к компонентам ядра, рендереру или React-адаптеру библиотеки. Если в будущем будут добавлены другие showcase-скины, они опишутся в собственных разделах.

Эталонный визуальный шаблон шоукейс-приложения — `docs/design/02-cyber-topographic.html` (стиль "Cyber Topographic"). Скин реализуется в `apps/playground/src/skins/cyber-topographic/` поверх theming-контракта библиотеки и применяется только внутри playground. Реализация скина выполняется ПОСЛЕ того, как все библиотечные пакеты (core, react, codemirror-plantuml, theme) завершены.

#### Skin-side Design Tokens

Скин публикует свои внутренние переменные и затем маппит их на library-контракт `--uml-*`. Тёмная — по умолчанию, светлая — через `[data-theme="light"]` на playground-корне.

**Тёмная тема (defaults):**

| Token | Назначение | Значение |
|-------|------------|----------|
| `--bg-0`, `--bg-1`, `--bg-2` | Фоны (страница / панели / поверхности) | `#06080C`, `#0A0E14`, `#11161F` |
| `--panel` | Полупрозрачная панель (с `backdrop-filter: blur`) | `rgba(15,21,30,0.78)` |
| `--ink`, `--ink-soft`, `--ink-dim` | Основной/вторичный/третичный текст | `#C9D7E6`, `#8B9AAE`, `#54647B` |
| `--line`, `--line-strong` | Разделители | `rgba(120,200,255,0.18 / 0.32)` |
| `--phos`, `--phos-2` | Акцент 1 (CTA, success, "live") | `#B8FF3D`, `#97DA28` |
| `--cyan` | Акцент 2 (контейнеры, ссылки, инфо) | `#4DEEEA` |
| `--magenta` | Акцент 3 (акторы, ошибки, deletion) | `#FF4D9E` |
| `--warn` | Акцент 4 (интеграции, warning) | `#FFB347` |
| `--topo-color`, `--topo-opacity` | Топографическая SVG-маска фона | `#78C8FF`, `0.13` |
| `--scan-opacity` | Сканлайн-наложение | `1` (выключается в светлой) |
| `--glow-*` | Свечения (`box-shadow` / `text-shadow`) | различные glow-эффекты |

**Светлая тема** переопределяет те же токены: `--bg-0: #F0EBDD`, `--ink: #15243A`; акценты затемняются для контраста (`--phos: #4F8C00`, `--cyan: #0B6A86`, `--magenta: #B8266F`, `--warn: #B5631A`); все glow-эффекты заменяются на мягкие drop-shadows; сканлайн полностью скрывается.

#### Skin-side Типографика

Скин подключает Google Fonts через CSS `@font-face` или `<link>` в playground-индекс:

- **Sora** (300–800) — заголовки, бренд, имена узлов в SVG.
- **Azeret Mono** (300–700) — body, текстовый редактор, метаданные, HUD.

Базовый `font-size: 12.5px`, `line-height: 1.55`. Заголовки секций — uppercase с letter-spacing `0.14em–0.22em`. Эти значения мапятся на `--uml-font-sans` / `--uml-font-mono` скином; библиотека их не знает.

#### Playground Layout (композиция приложения)

Сетка playground-приложения — `grid-template-rows: 56px 1fr 30px` (topbar / body / statusbar). Body — `grid-template-columns: 280px 1fr 360px` (палитра / холст / панель свойств + чат-канал команд). Это композиция **playground-приложения**, не структура `<UmlEditor>` — последний предоставляет только конфигурируемое расположение своих внутренних панелей.

```
┌────────────────────────────────────────────────────────────────┐
│  TOPBAR (56px)  brand · breadcrumb · actions · theme · CTA     │
├──────────────┬────────────────────────────────┬────────────────┤
│              │  CANVAS-COL                    │                │
│  ANCHORS     │  ┌──────────────────────────┐  │  PROPS /       │
│  (palette /  │  │  toolbar: tabs · zoom    │  │  COMMAND       │
│   tree)      │  ├──────────────────────────┤  │  CHANNEL       │
│  280px       │  │  CANVAS                  │  │  360px         │
│              │  │  + HUD overlays (4 угла) │  │                │
│              │  └──────────────────────────┘  │                │
├──────────────┴────────────────────────────────┴────────────────┤
│  STATUSBAR (30px)  system · db · llm · events · orphans · ver │
└────────────────────────────────────────────────────────────────┘
```

#### Ключевые UI-элементы скина (из шаблона)

- **Topbar**: бренд-glyph (бордер с `phos`-glow) + название с акцентом, breadcrumb с uppercase-letter-spacing, "live" pill с пульсирующей точкой, icon-buttons 34×34, segmented theme-switch (☾/☀ с скользящим pill), CTA-кнопка градиент `phos→phos-2`, аватар с conic gradient.
- **Левая панель (Anchors)**: секции с заголовком + counter-pill, anchor-rows вида `glyph · name · meta`. Glyph квадратный 22×22 цвета по типу элемента (BC=magenta, Entity=cyan, UseCase=phos, DTO=warn). Активная строка: `linear-gradient(90deg, phos-soft, transparent)` + левый бордер 3px phos.
- **Canvas-toolbar**: tabs с активным состоянием (cyan-soft fill + cyan border + cyan-line outer ring), zoom-pill справа.
- **Canvas**: dot-grid фон (`radial-gradient circle 1px`), плавающие HUD-оверлеи в четырёх углах (label + value rows + bars).
- **HUD**: `position: absolute`, `backdrop-filter: blur(8px)`, `border: 1px solid var(--line)`, `border-radius: 6px`. Используется для: текущего слоя/диаграммы (TL), coverage-метрик (TR), легенды цветов (BL), telemetry/regen-time (BR).
- **Правая панель (Command Channel)**: чат-формат с turn'ами (USER/SPEC·FORGE), pills для якорей, diff-блоки (`add` phos / `rem` magenta / `ref` cyan), composer с hints-чипами, prompt-glyph "/" размером 22px и input + send-button.
- **Statusbar**: цветные dots (phos/cyan/warn) + uppercase-метки, версия в правом углу.

Все эти элементы — часть **playground-приложения**, не часть библиотеки. Библиотека не поставляет компоненты `<Topbar>` / `<Statusbar>` / `<CommandChannel>` со своим визуалом; если эти компоненты появятся в `@uml-drawer/react` как опциональные supplementary-блоки — они будут headless-ish (структурный CSS + theming hooks).

#### Топографический фон (skin-side)

`body::before` (только в playground) — fixed-позиционированный слой с SVG-маской из синусоидальных кривых (12 path'ов, имитирующих топографические изолинии); цвет линий — `--topo-color`, прозрачность — `--topo-opacity`. SVG встраивается inline через `mask-image: url("data:image/svg+xml;utf8,...")`. `body::after` — сканлайн-grain через `repeating-linear-gradient`, `mix-blend-mode: overlay`, в светлой теме `opacity: 0` (выключен). Слои оба отключаются при `prefers-reduced-motion: reduce`.

#### Маппинг элементов шаблона на UML-домен (playground-side)

| Шаблон | UML Drawer playground |
|--------|-----------|
| ANCHORS-tree | **Outline** — иерархический список узлов и групп текущей диаграммы, отфильтрованный по типу |
| Anchor-glyphs (B/E/U/D/◆) | Иконки типов компонентов диаграммы (Class, Entity, Container, Component, Actor и т.д.) |
| Canvas tabs (C4/Sequence/ER) | Переключатель типа диаграммы (если в проекте несколько) или скрыт для одиночной диаграммы |
| HUD TL (Layer/Diagram) | Тип диаграммы + счётчик узлов/связей |
| HUD TR (Coverage) | Lint-метрики: процент валидных связей, незаконченные узлы, orphan refs |
| HUD BL (Legend) | Легенда цветов по типам узлов (тип диаграммы определяет набор) |
| HUD BR (Telemetry) | Время последнего auto-layout / parse, размер диаграммы |
| Command Channel (chat) | **Командная панель** — для вводимых slash-команд (`/add-class Foo`, `/connect A B`) и истории операций; альтернатива GUI для power-users |
| Composer hints | Контекстные команды для текущего типа диаграммы |
| Statusbar | Системные метрики: parse-time, errors-count, orphan-refs, версия библиотеки |

#### Палитра компонентов в playground

Левая колонка playground комбинирует две функции:
1. **Palette** (верхняя часть) — каталог компонентов для drag&drop, отфильтрованный по типу диаграммы (для C4 Container: Person, Software System, Container, Container Boundary).
2. **Outline** (нижняя часть) — список фактических узлов на холсте с подсветкой выбранного.

Между ними — переключатель `[ PALETTE | OUTLINE ]` (реализован как tab-row в стилистике canvas-tabs шаблона). `<Palette>` и `<Outline>` сами по себе — библиотечные компоненты с нейтральным дефолтом; tab-row, заголовки и counter-pills — часть скина.

#### Реализационные требования скина

- Скин маппит свои собственные переменные на library-контракт `--uml-*`. Если для воспроизведения шаблона `02-cyber-topographic.html` чего-то в контракте не хватает — фиксируется как gap в `docs/adr/` и контракт расширяется (это — обратная связь на достаточность контракта).
- Шрифты Sora + Azeret Mono подключаются скином/playground через CSS `@font-face` или document-level `<link>`; библиотека шрифты не подключает.
- Все glow/blur эффекты обязаны корректно гаснуть при `prefers-reduced-motion: reduce`.
- Скин и playground-композиция применяются на корне playground-приложения; ничего из них не утекает в импортирующее библиотеку приложение.

### Demo Application

`apps/playground` — showcase-приложение, демонстрирующее: (а) что design-agnostic библиотека достаточна для построения сложного, тяжело-стилизованного редактора; (б) полную интеграцию ядра с реальным AST, реальным CodeMirror, реальным ELK-layout. Импортирует cyber-topographic скин из `apps/playground/src/skins/cyber-topographic/` поверх библиотеки. Используется как visual regression и e2e тестбед: каждый PR прогоняет Playwright скриншоты playground-страниц против baseline. Все скриншоты в README и документации делаются с playground.

## Validation & Error Handling

### Уровни валидации

1. **Синтаксический** (parser): на каждое нажатие клавиши в текстовом редакторе — инкрементальный re-parse через Lezer; ошибки отображаются как маркеры CodeMirror.
2. **Семантический** (model validator): после успешного parse — проверка целостности AST: ссылки edges на существующие nodes, уникальность id, обязательные поля.
3. **Constraint validator**: проверка ограничений типа диаграммы (например, в Sequence все edges должны соединять lifelines).
4. **Lint** (предупреждения, не ошибки): дубликаты имён, неиспользуемые узлы, цикличность.

### Формат ошибки

```typescript
type DiagramError = {
  severity: 'error' | 'warning' | 'info';
  code: string;                    // 'SYNTAX_001', 'SEM_DUPLICATE_ID'...
  message: string;
  range?: { from: number; to: number };  // в тексте
  nodeId?: string;                 // в визуале
  fix?: { label: string; apply: () => void }; // quick fix
};
```

### Поведение при ошибках

- Синтаксические ошибки **не блокируют** AST — последний валидный AST сохраняется и продолжает рендериться, ошибки показываются маркерами.
- При фатальной ошибке парсинга визуальный редактор остаётся в read-only состоянии до исправления текста.
- Все ошибки отображаются в панели проблем (toggleable footer).

## Testing Plan

### Unit Tests (Vitest)

- **Parser**: round-trip `text → AST → text` для всех 5 типов диаграмм; набор фикстур с эталонными PlantUML.
- **Generator**: round-trip `AST → text → AST`; нормализация форматирования.
- **Validators**: каждое правило валидации с позитивными и негативными кейсами.
- **Commands**: каждая команда + undo восстанавливает предыдущее состояние; redo воспроизводит.
- **Layout adapter**: обёртка над ELK возвращает корректный формат, корректные fallback при ошибках ELK.

### Snapshot Tests

- AST → SVG для эталонного набора диаграмм каждого типа.
- AST → PlantUML текст (с нормализацией пробелов).

### E2E (Playwright)

- Drag&drop из палитры → элемент появился на холсте → текст обновился.
- Редактирование текста → AST обновился → визуал обновился.
- Undo/redo через UI и горячие клавиши.
- Zoom/pan/minimap.
- Экспорт SVG/PNG/PUML — содержимое валидно.
- Импорт PUML-файла — раскладка применилась корректно.

### Visual Regression

- По диаграмме каждого типа в светлой/тёмной теме.
- Стандартный набор сценариев (Hello World, средняя сложность, max-узлов).

## Deployment & Distribution

- **Публикация**: npm под scope `@uml-drawer/*` (или подобный, на выбор автора). Три пакета: `core`, `react`, `codemirror-plantuml`.
- **CI/CD**: GitHub Actions — lint → typecheck → unit → e2e → build → publish (на тэг релиза).
- **Версионирование**: semver + Changesets (для монорепо).
- **Документация**: `apps/docs` сайт на VitePress или Astro Starlight; автогенерация API из TypeScript declarations через TypeDoc.
- **Демо/playground**: задеплоено на GitHub Pages / Vercel из `apps/playground`.

## Open Questions

- **Sequence layout**: ELK не очень подходит для Sequence-диаграмм; нужен ли полностью кастомный движок раскладки или достаточно постпроцессора над ELK с фиксированными вертикальными lifelines? Решение определит сложность реализации.
- **Гранулярность undo для текстового режима**: атомарные команды (per-keystroke группировка) vs. группировка по семантическим действиям (typing burst)?
- **PlantUML completeness**: полная грамматика PlantUML огромна (preprocessor, !include, скиннинг). Какое подмножество поддерживать в MVP? Минимум — конструкции, описывающие 5 типов диаграмм; всё остальное парсится как opaque-блок.
- **Коллаборативное редактирование**: Yjs/CRDT не входит в скоуп MVP, но AST-структура должна позволять легко добавить позже (immutable updates, явные команды).
- **Sub-diagrams (drill-down в C4)**: связывать ли разные диаграммы (Container "раскрывается" в Component-диаграмму)? В текущем скоупе — нет, каждая диаграмма — отдельный артефакт.
- **AI-помощник**: генерация диаграммы по описанию через LLM API — рассматривать как отдельный пакет/расширение, не в ядре.
- **Touch / mobile UX**: не входит в evergreen-скоуп, но важно не закладывать решений, делающих touch невозможным (избегать hover-only взаимодействий).
