# Playground Layout — структура разметки

Снимок текущей DOM-разметки и CSS-grid сетки `apps/playground`. Источники:
`apps/playground/src/App.tsx`, `apps/playground/src/App.css`,
`apps/playground/src/hud/HudPanels.tsx`,
`apps/playground/src/components/CanvasToolbar.tsx`.

## 1. Визуальная схема (две grid-сетки)

### 1.1 Корневая сетка `.uml-playground` (grid-rows: 56px 1fr)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ HEADER  .uml-playground__topbar  (56px, grid-cols: brand | breadcrumb | act) │
│                                                                              │
│  ◉ uml-drawer·js  PLAYGROUND │ C4 · CLASS · ER · SEQ  • LIVE │ Dark Light Sk │
│                                                                  in  Export  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  EDITOR WRAP  .uml-playground__editor-wrap  (1fr)                            │
│  → внутри живёт <UmlEditor> с собственной grid-сеткой (см. §1.2)             │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Внутренняя сетка `<UmlEditor>` (анкеры через `grid-template-areas`)

```
grid-template-columns: minmax(240px,280px)  1fr  minmax(300px,360px)
grid-template-rows:    1fr  30px
grid-template-areas:
  "anchors  work     rightcol"
  "status   status   status"

┌─────────────────┬────────────────────────────────────┬──────────────────────┐
│ anchors         │ work                               │ rightcol             │
│ ─────────────── │ ────────────────────────────────── │ ──────────────────── │
│ <Palette/>      │  ┌─ Designer tab ───────────────┐  │ <PropsPanel/>        │
│  (flex 1 1 0)   │  │ <Canvas data-testid=          │  │  (flex 1 1 0)        │
│                 │  │   "playground-canvas">       │  │                      │
│                 │  │   <HUD                        │  │                      │
│                 │  │     tl=<HudTopLeft/>          │  │                      │
│                 │  │     tr=<HudTopRight/>         │  │                      │
│                 │  │     br=<HudBottomRight/> />   │  │                      │
│                 │  │   <CanvasToolbar/>            │  │                      │
│                 │  │ </Canvas>                     │  │                      │
│                 │  └───────────────────────────────┘  │                      │
│ <Outline/>      │  ┌─ PlantUML tab ────────────────┐  │ <CommandChannel/>    │
│  (flex 1 1 0)   │  │ <TextEditor title="PlantUML"/>│  │  (flex 1 1 0)        │
│                 │  └───────────────────────────────┘  │                      │
│                 │  ┌─ <Tabs tabsPosition="bottom">────┐ (Alt+1 / Alt+2)      │
│                 │  │ [ Designer ] [ PlantUML ]    │  │                      │
│                 │  └──────────────────────────────┘  │                      │
├─────────────────┴────────────────────────────────────┴──────────────────────┤
│ <Statusbar label="UML-DRAWER" trailing="BUILD · 0.0.0"/>     (30px, span 3) │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 2. JSX-дерево (`App.tsx`)

```text
<div class="uml-playground">                            ← grid-rows: 56px 1fr
  ├─ <header class="uml-playground__topbar">            ← grid-cols: auto 1fr auto
  │   ├─ <div class="uml-playground__brand">
  │   │   ├─ <div class="uml-playground__brand-glyph">◉</div>
  │   │   ├─ <div class="uml-playground__brand-name">uml-drawer<span>·js</span></div>
  │   │   └─ <div class="uml-playground__brand-tag">PLAYGROUND</div>
  │   ├─ <nav class="uml-playground__breadcrumb" aria-label="Diagram type">
  │   │   ├─ <button class="uml-playground__breadcrumb-button"> … C4 Context </button>
  │   │   ├─ <span class="uml-playground__breadcrumb-sep"> · </span>
  │   │   ├─ <button …> C4 Container </button>
  │   │   ├─ <button …> C4 Component </button>
  │   │   ├─ <button …> Class </button>
  │   │   ├─ <button …> ER </button>
  │   │   ├─ <button …> Sequence </button>
  │   │   └─ <span class="uml-playground__live">
  │   │       ├─ <span class="uml-playground__live-dot"/>
  │   │       └─ "LIVE"
  │   └─ <div class="uml-playground__topbar-actions">
  │       ├─ <div class="uml-playground__theme-switch" role="group" aria-label="Theme">
  │       │   ├─ <button class="uml-playground__theme-button" aria-pressed>Dark</button>
  │       │   ├─ <button class="uml-playground__theme-button">Light</button>
  │       │   └─ <button class="uml-playground__theme-button">Skin | Bare</button>
  │       └─ <button class="uml-playground__cta">Export</button>
  │
  └─ <div class="uml-playground__editor-wrap">
      └─ <UmlEditor                                     ← рендерит .uml-editor (grid)
            key={diagramType}
            diagramType={diagramType}
            value={doc}
            theme={theme}
            layout={{ text: "hidden" }}
            onChange={…}>
          ├─ <div class="uml-playground__anchors">      ← grid-area: anchors
          │   ├─ <Palette title="Palette"/>
          │   └─ <Outline title="Outline"/>
          │
          ├─ <div class="uml-playground__workzone">     ← grid-area: work
          │   └─ <Tabs
          │        aria-label="Workspace view"
          │        tabsPosition="bottom"
          │        keepMounted
          │        value={activeTab}
          │        onChange={…}
          │        tabs={[
          │          { id: "designer",  label: "Designer",
          │            content: <Canvas data-testid="playground-canvas">
          │                       <HUD
          │                         tl={<HudTopLeft/>}
          │                         tr={<HudTopRight/>}
          │                         br={<HudBottomRight/>}
          │                       />
          │                       <CanvasToolbar/>
          │                     </Canvas> },
          │          { id: "plantuml", label: "PlantUML",
          │            content: <TextEditor title="PlantUML"/> },
          │        ]}/>
          │
          ├─ <div class="uml-playground__rightcol">     ← grid-area: rightcol
          │   ├─ <PropsPanel title="Properties"/>
          │   └─ <CommandChannel
          │        title="Command Channel"
          │        commands={PLAYGROUND_COMMANDS}
          │        placeholder="/add-class Foo · /connect Foo Bar association · /rename Foo Bar"/>
          │
          └─ <Statusbar                                  ← grid-area: status
                label="UML-DRAWER"
                trailing={<span class="uml-playground__build-tag">BUILD · 0.0.0</span>}/>
```

## 3. HUD-панели (оверлей над `<Canvas>`)

`<HUD>` принимает три именованных слота. На canvas они позиционируются абсолютно.

| Слот | Компонент           | Содержимое (`<dl>` пары `dt/dd`)                                   |
| ---- | ------------------- | ------------------------------------------------------------------ |
| `tl` | `<HudTopLeft/>`     | Type → метка диаграммы, Nodes, Edges, Groups                       |
| `tr` | `<HudTopRight/>`    | Valid edges %, Dangling, Orphans, Cycles (по `useDiagramErrors()`) |
| `br` | `<HudBottomRight/>` | Regen ms, Bytes, Errors (телеметрия по `useEditorState()`)         |

## 4. CanvasToolbar (плавающая, `position: absolute`, низ-правый угол)

```
┌──────────────────────────────────────────────────────────────────┐
│  [ − ]  [ 100% ]  [ + ]  │  [ ⤢ Fit ]  [ ▦ Grid ]  [ 🔓/🔒 ]      │
│                          │   …  если diagramType === "sequence": │
│                          │   [ Kind: Auto / →Sync / ↠Async / … ] │
└──────────────────────────────────────────────────────────────────┘
```

Компоненты:

- `.uml-canvas-toolbar__button` — zoom-out, zoom-in, fit, grid, lock.
- `.uml-canvas-toolbar__readout` — текущий зум в процентах (клик → `zoomReset`).
- `.uml-canvas-toolbar__divider` — визуальные разделители групп.
- `.uml-canvas-toolbar__select` (только для sequence) — пред-выбор kind для drag-to-connect:
  Auto · Sync · Async · Return · Create · Destroy · Found · Lost.

## 5. CSS-таблица анкеров

| Класс / селектор                             | Роль                                              | Ключевые правила                                                        |
| -------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------- |
| `.uml-playground`                            | Корневая grid-сетка страницы                      | `grid-template-rows: 56px 1fr; height: 100vh`                           |
| `.uml-playground__topbar`                    | Верхняя панель с brand / breadcrumb / actions     | `grid-template-columns: minmax(280px,auto) 1fr auto`                    |
| `.uml-playground__editor-wrap`               | Контейнер для `<UmlEditor>`                       | `min-height: 0; position: relative; overflow: hidden`                   |
| `.uml-playground__editor-wrap > .uml-editor` | Внутренняя grid `<UmlEditor>`                     | `grid-template-areas: "anchors work rightcol" / "status status status"` |
| `.uml-playground__anchors`                   | Левая колонка (Palette + Outline)                 | `grid-area: anchors; flex-direction: column`                            |
| `.uml-playground__workzone`                  | Центральная зона (Designer ↔ PlantUML через Tabs) | `grid-area: work; display: flex`                                        |
| `.uml-playground__rightcol`                  | Правая колонка (Properties + CommandChannel)      | `grid-area: rightcol; flex-direction: column`                           |
| `.uml-playground .uml-statusbar`             | Нижняя строка статуса, спан на 3 колонки          | `grid-area: status`                                                     |
| `.uml-canvas-toolbar`                        | Плавающая панель управления холстом               | `position: absolute; right: 12px; bottom: 12px`                         |

## 6. Привязка к данным и эффекты

- Состояние: `diagramType`, `theme`, `skin`, `doc`, `activeTab` (`useState` в `App`).
- `useEffect` №1 — пишет `document.body.dataset.theme`.
- `useEffect` №2 — навешивает/снимает класс `cyber-topographic-skin` на `<body>`.
- `useEffect` №3 — глобальный `keydown` Alt+1 / Alt+2 для переключения вкладок.
- `handleDiagramSwitch(type)` — меняет тип диаграммы и подставляет `SAMPLES[type]`.
- `<UmlEditor key={diagramType}>` — пересоздаёт инстанс при смене типа (полный reset
  истории, AST, layout — это сознательное решение).
- `layout={{ text: "hidden" }}` — отключает встроенный «PlantUML»-слот библиотеки,
  потому что playground сам монтирует `<TextEditor>` внутрь `<Tabs>`.

## 7. Слои стилей

```
@uml-drawer/react/styles.css        ← библиотека (нейтральная база)
    │
    ▼
apps/playground/src/skins/
  cyber-topographic/index.css       ← showcase-скин (только когда .cyber-topographic-skin)
    │
    ▼
apps/playground/src/App.css         ← компоновка playground (.uml-playground*)
```

Порядок импортов в `App.tsx` именно такой, чтобы App.css перебивал и базу, и скин
по source-order, не уходя в `!important`.
