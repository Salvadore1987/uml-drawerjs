# UML Drawer JS — Implementation Plan & TODO

> Источник истины для требований — [`docs/uml-drawer.md`](./uml-drawer.md).
> Эталон визуального стиля — [`docs/design/02-cyber-topographic.html`](./design/02-cyber-topographic.html).
>
> **Соглашение по чек-листу:** незавершённые задачи — `- [ ]`, выполненные — `✅` (зелёная галочка), не `- [x]`.

---

## 0. Контекст и цели

Реализовать MVP библиотеки графического редактора UML-диаграмм с двунаправленной синхронизацией визуала и PlantUML-DSL. Поставка — npm-монорепо `@uml-drawer/*` (MIT). Текущее состояние репозитория: только спецификация и визуальный референс, кода нет — стартуем с нуля.

**Ключевые принципы реализации:**

- **AST как единственный источник правды**, любые изменения — через CQRS-команды (для undo/redo и будущего CRDT).
- **Гексагональная архитектура** в ядре: парсер/модель/генератор/валидаторы/layout/renderer/exporters изолированы от UI.
- **Framework-agnostic core + React-адаптер** — отдельные пакеты, ESM, tree-shakeable.
- **Design-agnostic library**: компоненты ядра, рендерер и React-адаптер не несут бренд-эстетики. Стилизация — только через theming contract `--uml-*` (CSS-переменные с нейтральными дефолтами). Никаких hardcoded цветов, никакой типографики Sora/Azeret Mono, никаких эффектов из cyber-topographic в коде библиотеки.
- **Cyber-topographic — отдельный showcase-скин**, реализуется ПОСЛЕ MVP библиотеки в `apps/playground/src/skins/cyber-topographic/` поверх theming-контракта. Не входит в публикуемые npm-пакеты.
- **Lazy-загрузка тяжёлого** (ELK.js) — только при первом auto-layout.
- **Performance budgets:** 60 FPS pan/zoom на 200 узлах; parse + regen < 50 мс; bundle ≤ 500 KB gzip.

---

## 1. Карта зависимостей фаз

```
P0 ──► P1 (theme contract)
   ├─► P2 (core skeleton+AST) ──► P3 (commands/history)
   │                          ├─► P4 (parser) ──► P5 (generator)
   │                          ├─► P6 (validators) [needs P4]
   │                          ├─► P7 (layout)
   │                          └─► P8 (renderer) [needs P1, P2]
   │                                  └─► P9 (exporters) [needs P4, P5, P8]
   │                                          └─► P10 (editor bootstrap) [needs P3..P9]
   ├─► P11 (codemirror-plantuml) [needs P4, P6]
   └─► P12 (react adapter) [needs P10]
              └─► P13a (cyber-topographic showcase skin) [needs P1 finalized, P10, P12]
                       └─► P13 (playground composition) [needs P13a]

P14 (testing/quality gates) идёт параллельно каждой фазе.
P15/P16 (CI/CD, docs) финализируются после MVP (P13).
P17 (ADR по open questions) — заводятся по мере принятия решений, не блокируют MVP.

⚠️ Phase 13a — отдельная фаза «cyber-topographic showcase skin». Это **не** часть библиотеки;
скин реализуется поверх готового theming-контракта (P1) и API library (P10/P12), и обнаруживает
gap'ы контракта, которые могут потребовать расширения P1 (фиксируются ADR'ом).
```

---

## 2. Phase 0 — Repository Bootstrap

**Цель:** монорепо, инструментарий, единый pipeline `lint → typecheck → test → build`.

✅ `git init`, `.gitignore`, `.editorconfig`, `.nvmrc` (Node 20 LTS).
✅ Корневой `package.json` (`"private": true`) + `pnpm-workspace.yaml` со списком `packages/*` и `apps/*`.
✅ `tsconfig.base.json`: `strict: true`, `target: ES2022`, `moduleResolution: bundler`, `noUncheckedIndexedAccess: true`.
✅ ESLint + Prettier конфиги в корне (опционально — внутренний пакет `@uml-drawer/eslint-config`).
✅ Husky + lint-staged + commitlint (Conventional Commits).
✅ Changesets (`@changesets/cli init`) для версионирования монорепо.
✅ Vitest workspace + Playwright config skeleton.
✅ GitHub Actions workflow stubs: `lint.yml`, `test.yml`, `build.yml`, `release.yml`.
✅ `LICENSE` (MIT), корневой `README.md` (placeholder), `CONTRIBUTING.md`.

**Критерий выхода:** `pnpm install && pnpm typecheck && pnpm lint` работают на пустых workspace без ошибок. ✅

---

## 3. Phase 1 — `@uml-drawer/theme` (Design-Agnostic Theming Contract)

**Цель:** опубликовать **theming contract** библиотеки — документированный набор CSS-переменных в namespace `--uml-*` с нейтральными дефолтами. Бренд-эстетики (cyber-topographic, любая иная) в этом пакете НЕТ.

- [ ] Скелет `packages/theme` с Vite library build → CSS-only output.
- [ ] `contract.css` — декларация всех `--uml-*` переменных (поверхности, текст, линии, семантика, узлы, связи, холст, выделение, шрифты, радиусы, тени) с краткими комментариями назначения.
- [ ] `defaults-dark.css` и `defaults-light.css` — нейтральные дефолтные значения (`system-ui`, `ui-monospace`, neutral grays/blues, без бренд-акцентов). Подключаются автоматически вместе с `contract.css`.
- [ ] Поддержка `data-theme="light" | "dark"` на host-контейнере виджета (не глобальный `:root`), transition 0.2–0.4s на `background` / `color`.
- [ ] Авто-detect темы через `prefers-color-scheme`, если `data-theme` не задан.
- [ ] `prefers-reduced-motion: reduce` overrides — отключение transition'ов; никаких glow/blur в библиотеке вообще не используется, поэтому этот override на стороне библиотеки тривиален (но контракт обязывает скины это поддерживать).
- [ ] `tokens.json` — машиночитаемая декларация контракта (имена, дефолтные значения, описания) для downstream-пакетов, генератора SVG, API-reference и валидации скинов.
- [ ] README пакета: пример «как написать свой скин» (override каких-нибудь переменных через `:where(.my-skin) { --uml-accent: ...; }`).

**Что НЕ делается в этой фазе:**

- Никакого Sora / Azeret Mono.
- Никакого топографического SVG-фона.
- Никаких glow / scanline эффектов.
- Никаких cyber-topographic токенов (`--phos`, `--cyan`, `--magenta`, `--bg-0` и т. п.).

Всё это переезжает в **Phase 13a** (cyber-topographic showcase skin) и живёт в `apps/playground/src/skins/cyber-topographic/`.

**Критерий выхода:** `pnpm build` в `packages/theme` собирает `contract.css` + `defaults-*.css`; импорт в чистый HTML с пустым `<div data-theme="dark">` показывает нейтральный темный UI (никакого фирменного вида); все ожидаемые `--uml-*` переменные доступны через `getComputedStyle`.

---

## 4. Phase 2 — `@uml-drawer/core` Skeleton & AST Model

**Цель:** базовая структура ядра + типы AST как фундамент для всех остальных модулей.

- [ ] Пакет `packages/core`: Vite library mode, ESM-only, `sideEffects: false`, `.d.ts`.
- [ ] Папки модулей: `parser/`, `model/`, `generator/`, `validators/`, `layout/`, `renderer/`, `commands/`, `history/`, `exporters/`, `editor/`.
- [ ] `model/types.ts`: `Diagram`, `Node`, `Edge`, `Group`, `Attribute`, `Operation`, `NodeKind`, `EdgeKind`, `StyleMap`, `DiagramError` (по спеке).
- [ ] Иммутабельные операции над AST (Immer или ручной structural sharing).
- [ ] UUIDv7 генератор id (по глобальному правилу проекта).
- [ ] `metadata.schemaVersion` + JSON-schema для `.umljson`.
- [ ] Zod-схемы (или type guards) для runtime-валидации AST на API-границе.
- [ ] Утилиты: `createEmptyDiagram(type)`, `findNode(ast, id)`, `getEdgesOfNode`, `cloneDiagram`.

**Критерий выхода:** `createEmptyDiagram('class')` сериализуется/десериализуется без потерь; все типы экспортируются из `@uml-drawer/core/model`.

---

## 5. Phase 3 — Commands (CQRS) & History

**Цель:** все мутации проходят через команды → бесплатный undo/redo + готовность к CRDT.

- [ ] Базовый тип команды `{ kind, payload, apply(ast), invert(ast) }`.
- [ ] Реализовать команды (по спеке):
    - [ ] `AddNodeCommand`
    - [ ] `RemoveNodeCommand` (каскадно убирает edges)
    - [ ] `MoveNodeCommand` (writeback в `metadata.layoutOverrides`)
    - [ ] `UpdateNodeCommand`
    - [ ] `AddEdgeCommand`
    - [ ] `RemoveEdgeCommand`
    - [ ] `UpdateEdgeCommand`
    - [ ] `GroupCommand` (create/update/dissolve)
    - [ ] `ApplyLayoutCommand`
    - [ ] `ImportTextCommand` (полная замена AST)
- [ ] CommandBus с синхронным dispatch + before/after-events.
- [ ] History stack: `undo()` / `redo()`, конфигурируемый coalesce (для bursts набора текста).
- [ ] Vitest: каждая команда + её инверсия, redo детерминирован.

**Критерий выхода:** 100% покрытие команд; `apply → invert` восстанавливает byte-equal JSON-снапшот AST.

---

## 6. Phase 4 — DSL Parser (Lezer)

**Цель:** инкрементальный парсер PlantUML → AST, переиспользуемый и в ядре, и в CodeMirror.

- [ ] Lezer-грамматика подмножества PlantUML под 5 типов диаграмм (старт: C4 + Class, далее ER/Sequence).
- [ ] Build-скрипт `.grammar` → сгенерированный парсер (`@lezer/generator`).
- [ ] AST-builder, обходящий Lezer-дерево и собирающий `Diagram`.
- [ ] Opaque-block fallback для неподдерживаемых конструкций (preprocessor, !include) — сохраняем как `metadata.opaque`.
- [ ] Декодер аннотаций `' @drawer:meta {...}` → `metadata.layoutOverrides`, `styles`.
- [ ] Фикстуры: эталонные `.puml` файлы в `packages/core/__fixtures__/{c4-context,c4-container,c4-component,class,er,sequence}/`.
- [ ] Round-trip тесты: `parse(text) → AST` совпадает с JSON-snapshot.
- [ ] Подмножество PlantUML для MVP зафиксировать ADR-ом (см. Phase 17).

**Критерий выхода:** все 5 типов парсятся; ошибочный ввод → `DiagramError` с `range` и `code: SYNTAX_*`; AST не разрушается (последний валидный сохраняется).

---

## 7. Phase 5 — Generator (AST → PlantUML)

**Цель:** обратный путь — из AST в текст с сохранением метаданных.

- [ ] Per-type рендереры: `c4-context`, `c4-container`, `c4-component`, `class`, `er`, `sequence`.
- [ ] Кодирование `metadata.layoutOverrides` + `styles` в `' @drawer:meta` комментарии (игнорируются другими PlantUML-рендерерами).
- [ ] Стабильное форматирование (детерминированный порядок узлов/связей, нормализация пробелов).
- [ ] Property-based тесты: `gen(parse(t))` нормализует, `parse(gen(ast))` равен `ast`.

**Критерий выхода:** snapshot-suite зелёный; правила нормализации описаны в `packages/core/generator/README.md`.

---

## 8. Phase 6 — Validators & Linter

**Цель:** многоуровневая валидация по спеке (sync / semantic / constraints / lint).

- [ ] `validators/syntax.ts` — оборачивает Lezer-ошибки в `DiagramError`.
- [ ] `validators/semantic.ts` — уникальность id, существование endpoints у edges, обязательные поля по `NodeKind`, пустые имена.
- [ ] `validators/constraints.ts` — правила на тип диаграммы:
    - C4: вложенность Boundary/Container/Component.
    - Sequence: edges только между lifelines.
    - ER: связи только Entity↔Entity, кардинальности валидны.
    - Class: ассоциация/наследование/композиция корректны.
- [ ] `validators/lint.ts` — orphan-узлы, дубликаты имён, циклы зависимостей.
- [ ] Реестр quick-fixes по `code` ошибки → возвращает `Command[]` или текстовые правки.

**Критерий выхода:** каждое правило покрыто позитивным и негативным кейсом; quick-fix сэмплы прокидываются в CodeMirror lint и в panel of problems.

---

## 9. Phase 7 — Layout

**Цель:** auto-layout по кнопке и при импорте текста, lazy-загрузка ELK.

- [ ] `layout/elk.ts` — адаптер: dynamic-import ELK.js, маппинг `Diagram` → ELK graph → запись координат.
- [ ] Поддержка вложенных групп для C4 boundaries.
- [ ] `layout/sequence.ts` — кастомный алгоритм: вертикальные lifelines + временная ось по индексу события.
- [ ] Fallback layout (grid) при ошибке ELK.
- [ ] Перф-бенч в Vitest: ≤ 50 мс на 200 узлов.

**Критерий выхода:** auto-layout детерминирован; ELK подключается только при первом вызове `runAutoLayout()`; bundle ядра без ELK не превышает базовый бюджет.

---

## 10. Phase 8 — SVG Renderer

**Цель:** интерактивный SVG-холст с pan/zoom/minimap и keyboard-навигацией.

- [ ] Мини декларативный SVG-слой (без D3): virtual-tree → реальные узлы.
- [ ] Рендереры по `NodeKind` и `EdgeKind` (стереотип-бейджи, attribute-rows для Class/ER, cardinality-метки для ER).
- [ ] Привязка стрелок к точкам узлов (port snapping); ортогональный/curved routing.
- [ ] Все стили — через library theming contract `--uml-*` (`@uml-drawer/theme`), никаких hex-значений и никаких упоминаний конкретных скинов в коде рендерера.
- [ ] Pan/zoom (wheel + pinch), minimap.
- [ ] Selection model + drag handles + хуки для props-panel.
- [ ] Keyboard: Tab между узлами, стрелки — перемещение, Delete — удаление, Enter — редактирование.
- [ ] ARIA-роли + текстовый режим как screen-reader-friendly альтернатива.

**Критерий выхода:** диаграмма на 200 узлов рендерится при 60 FPS pan/zoom (Playwright FPS-проба); dot-grid-фон и HUD-оверлеи соответствуют шаблону.

---

## 11. Phase 9 — Exporters / Importers

**Цель:** интероперабельность форматов: `.puml`, SVG, PNG, `.umljson`.

- [ ] `exporters/puml.ts` — обёртка над generator.
- [ ] `exporters/svg.ts` — сериализация renderer-output с inline-стилями.
- [ ] `exporters/png.ts` — SVG → `<foreignObject>` → Canvas → `Blob` через `canvas.toBlob()`.
- [ ] `exporters/json.ts` — полный AST + `layoutOverrides` + `styles` + `schemaVersion`.
- [ ] Симметричные импортёры: `importPuml`, `importJson` (с авто-layout при импорте текста без meta-комментариев).

**Критерий выхода:** export ⇄ import round-trip сохраняет AST + layout для всех 5 типов диаграмм.

---

## 12. Phase 10 — `editor/createEditor` Vanilla Bootstrap

**Цель:** публичный API ядра для не-React хостов (vanilla JS).

- [ ] `createEditor(host, options)` композирует parser + generator + validators + renderer + history.
- [ ] Возвращает объект с методами по спеке: `loadFromText`, `loadFromJson`, `exportText`, `exportSvg`, `exportPng`, `exportJson`, `undo`, `redo`, `runAutoLayout`, `applyTheme`, `destroy`.
- [ ] `onChange` отдаёт `{ text, ast, errors }` после каждой команды.
- [ ] CSS-переменные применяются к host-контейнеру, не к глобальному `:root`.
- [ ] Авто-выбор темы через `prefers-color-scheme`, если `data-theme` не задан.

**Критерий выхода:** smoke-тест в plain HTML монтирует редактор, добавляет узел, экспортирует SVG; `destroy()` убирает все listeners и DOM-узлы.

---

## 13. Phase 11 — `@uml-drawer/codemirror-plantuml`

**Цель:** CodeMirror 6-расширение поверх той же Lezer-грамматики.

- [ ] Language package, переиспользующий грамматику из ядра.
- [ ] Highlight-стили, привязанные к токенам темы.
- [ ] Diagnostics → CM-маркеры; quick-fix lens через `@codemirror/lint`.
- [ ] Autocomplete: ключевые слова, существующие id узлов, kinds — context-aware по типу диаграммы.
- [ ] Snippet-completions для типичных конструкций (`@startuml ...`).

**Критерий выхода:** demo-страница в playground показывает highlight + diagnostics + autocomplete + quick-fix.

---

## 14. Phase 12 — `@uml-drawer/react` Adapter

**Цель:** идиоматичный React-API поверх ядра. Компоненты headless-ish: только структурный CSS + theming hooks через `--uml-*`. Никакой бренд-эстетики.

- [ ] `<UmlEditor>` root: controlled (`value`) / uncontrolled (`defaultValue`); `onChange`, `onValidate`.
- [ ] Core sub-components: `<Canvas>`, `<Palette>`, `<PropsPanel>`, `<TextEditor>`, `<Outline>`. Это библиотечные компоненты UML-домена.
- [ ] Optional supplementary headless-компоненты: `<HUD>`, `<CommandChannel>`, `<Statusbar>`. Поставляются как тонкие primitives с структурным CSS, но без декоративного визуала. Их использование опционально и в playground они переоформляются скином.
- [ ] Хуки: `useEditorState`, `useDiagramErrors`, `useSelection`.
- [ ] Prop `layout={{ palette, props, text }}` управляет расположением панелей.
- [ ] Prop `paletteFilter` — фильтрация компонентов палитры.
- [ ] Strict-mode safe: нет утечек глобального состояния, корректная работа с двойным рендером.
- [ ] React 18+ как peer dependency.
- [ ] Stylesheet адаптера импортирует `@uml-drawer/theme/contract.css` и обращается ТОЛЬКО к `--uml-*` переменным; никаких hex/rgb значений.

**Критерий выхода:** Storybook (или Ladle) с примером каждого компонента в нейтральной дефолтной теме (без скина); tree-shake-проверка через `size-limit`; «голый» рендер `<UmlEditor>` без подключённого скина выглядит читаемо и нейтрально (verified в P14).

---

## 14a. Phase 13a — Cyber-Topographic Showcase Skin

**Цель:** реализовать **отдельный скин** `apps/playground/src/skins/cyber-topographic/`, маппирующий cyber-topographic эстетику на library-контракт `--uml-*`. Эта фаза начинается ТОЛЬКО после того, как `@uml-drawer/theme` (P1) и `@uml-drawer/react` (P12) feature-complete и стабильны. Скин не публикуется в npm как часть библиотеки — он живёт внутри playground.

- [ ] Создать структуру `apps/playground/src/skins/cyber-topographic/`:
    - [ ] `tokens.css` — внутренние skin-переменные (`--phos`, `--cyan`, `--magenta`, `--bg-0..2`, `--ink*`, `--line*`, `--glow-*`, `--topo-color`) для тёмной темы (default) и светлой (`[data-theme="light"]`).
    - [ ] `mapping.css` — маппинг skin-переменных на library-контракт: `--uml-bg: var(--bg-0); --uml-text: var(--ink); --uml-accent: var(--phos); ...`. Полная таблица маппинга задокументирована в комментариях.
    - [ ] `bg.css` — топографический SVG-фон (`body::before` 12 path'ов synth-curves) + сканлайн-grain (`body::after` `repeating-linear-gradient`, `mix-blend-mode: overlay`); оба слоя выключены при `prefers-reduced-motion: reduce` и в светлой теме.
    - [ ] `fonts.css` — `<link>` или `@font-face` для Sora 300–800 + Azeret Mono 300–700; маппинг в `--uml-font-sans` / `--uml-font-mono`.
    - [ ] `decorations.css` — оформление topbar/anchors/canvas-toolbar/HUD/command-channel/statusbar (всё, что в спеке описано как Playground Showcase Design); только селекторы внутри `.cyber-topographic-skin` корня playground.
    - [ ] `index.css` — единый entry, импортирующий все вышеперечисленные.
- [ ] Поддержка `prefers-reduced-motion: reduce` — отключение всех glow / blur / scanline / topographic-фона.
- [ ] Поддержка `prefers-color-scheme` — авто-detect темы при отсутствии `data-theme`.
- [ ] **Gap-аудит контракта**: пройтись по шаблону и проверить, что для каждого визуального аспекта в library-контракте `--uml-*` есть подходящая переменная. Если чего-то не хватает (например, нужны `--uml-glow-accent` или `--uml-canvas-grid-density`) — открыть ADR в `docs/adr/000X-theming-contract-extension-*.md`, расширить контракт в P1, выпустить minor-bump `@uml-drawer/theme`. **Это намеренный feedback-loop**: showcase валидирует достаточность контракта.
- [ ] Документация скина: `apps/playground/src/skins/cyber-topographic/README.md` — какие library-переменные переопределены и зачем.

**Критерий выхода:** скин активируется добавлением одного класса `.cyber-topographic-skin` на корень playground-приложения, после чего playground визуально соответствует `02-cyber-topographic.html`; снятие класса возвращает нейтральный дефолтный визуал библиотеки. Visual diff ≤ 2% против шаблона на Playwright скриншот-тестах. Никаких изменений в коде `packages/*` для применения скина не требуется.

---

## 15. Phase 13 — `apps/playground` (Showcase Composition)

**Цель:** showcase-приложение поверх готовой библиотеки и cyber-topographic скина (P13a). Демонстрирует, что design-agnostic ядро достаточно для построения тяжело-стилизованного редактора. Visual regression и e2e тестбед.

- [ ] Vite-приложение, повторяющее структуру шаблона `02-cyber-topographic.html`: topbar (brand + breadcrumb + live-pill + theme-switch + CTA), anchors-tree (Palette+Outline tabs), canvas-col (tabs + zoom + canvas + 4 HUD-оверлея), props/command channel, statusbar.
- [ ] На корне приложения подключён класс `.cyber-topographic-skin` и импортирован `apps/playground/src/skins/cyber-topographic/index.css`.
- [ ] Подключение реального `@uml-drawer/react` `<UmlEditor>`. Доп. supplementary-компоненты (`<HUD>`, `<CommandChannel>`, `<Statusbar>`) использованы для построения композиции.
- [ ] HUD-биндинги:
    - **TL:** тип диаграммы + счётчик узлов/связей.
    - **TR:** lint-метрики (% валидных связей, незавершённые, orphan-refs).
    - **BL:** легенда цветов по типам.
    - **BR:** телеметрия — время parse/layout, размер диаграммы.
- [ ] Command Channel: реализовать `/add-class`, `/connect`, `/rename`, `/group`, `/ungroup` как обёртки над CQRS-командами.
- [ ] Образцовые диаграммы по одному на каждый тип (доступны через breadcrumb).
- [ ] Тема переключается через `data-theme` на корне playground без remount + transition 0.3s.
- [ ] Skin-toggle (debug): возможность убрать класс `.cyber-topographic-skin` для демонстрации голого нейтрального вида библиотеки — служит и demo, и smoke-проверкой design-agnostic поведения.

**Критерий выхода:** деплой на Vercel/GH Pages; visual diff против `02-cyber-topographic.html` ≤ 2% на Playwright screenshot-тестах; режим без скина (`without-skin`) рендерится без артефактов.

---

## 16. Phase 14 — Testing & Quality Gates (идёт параллельно фазам)

**Цель:** все требования NFR подтверждены автоматически.

- [ ] Vitest unit suites для каждого пакета; coverage gate ≥ 85% на `core`.
- [ ] Snapshot-тесты ядра: AST↔text, AST→SVG (по диаграмме каждого типа × нейтральная light/dark тема, БЕЗ skin'ов). Подтверждают, что библиотека рендерится корректно сама по себе.
- [ ] **Design-agnostic guard**: тест, гарантирующий что собранный CSS пакетов `core` / `react` / `theme` не содержит hex-литералов (за исключением нейтральных дефолтов в `defaults-*.css`) и не упоминает skin-специфичных имён переменных (`--phos`, `--cyan`, `--bg-0`, etc.). Реализуется как regex-grep в CI.
- [ ] Playwright E2E:
    - [ ] Drag&drop из палитры → элемент на холсте → текст обновился.
    - [ ] Правка текста → AST обновился → визуал обновился.
    - [ ] Undo/redo через UI и горячие клавиши (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z).
    - [ ] Zoom/pan/minimap.
    - [ ] Экспорт SVG/PNG/PUML — содержимое валидно.
    - [ ] Импорт PUML-файла — раскладка применилась.
- [ ] Visual regression (`toHaveScreenshot`) — два набора:
    - [ ] **Library-only** baseline: рендер `<UmlEditor>` без скина (нейтральная тема) per type × theme × scale. Защищает от случайных регрессий «голого» визуала.
    - [ ] **Showcase** baseline: playground с `.cyber-topographic-skin` per type × theme × scale (Hello-World / mid / 200-node max). Защищает соответствие шаблону `02-cyber-topographic.html` (≤ 2% diff).
- [ ] Performance bench: parse + regen < 50 мс на типичной диаграмме; pan/zoom 60 FPS.
- [ ] Bundle-size guard через `size-limit`: core + react + ELK ≤ 500 KB gzip. Скин в этот бюджет не входит.
- [ ] Accessibility: axe-core на playground; E2E keyboard-navigation.

**Критерий выхода:** все gates зелёные в CI; performance-budgets пройдены.

---

## 17. Phase 15 — CI/CD & Release

**Цель:** автоматическая публикация и деплой playground.

- [ ] `.github/workflows/ci.yml`: lint → typecheck → unit → e2e → build → size → visual-regression.
- [ ] `.github/workflows/release.yml`: Changesets `publish` на тег; npm provenance включён.
- [ ] `.github/workflows/deploy-playground.yml`: GH Pages или Vercel из `apps/playground` на push в `main`.
- [ ] Pre-1.0 semver-политика задокументирована в `CONTRIBUTING.md`.

**Критерий выхода:** dry-run release публикует `0.0.0-canary` тарболы успешно.

---

## 18. Phase 16 — Documentation

**Цель:** живая документация и API-reference для пользователей библиотеки.

- [ ] `apps/docs` сайт на VitePress (или Astro Starlight).
- [ ] Секции: Getting Started, Concepts (AST, sync, commands), Per-Diagram-Type Guides, Theming, API Reference (TypeDoc), Recipes, Migration.
- [ ] Live-embed playground через iframe.
- [ ] CHANGELOG via Changesets.

**Критерий выхода:** docs задеплоены; broken-link check зелёный; API-reference авто-регенерируется на каждый релиз.

---

## 19. Phase 17 — ADR по Open Questions (не блокируют MVP)

**Цель:** решения по открытым вопросам спеки зафиксировать как ADR в `docs/adr/`.

- [ ] `docs/adr/0001-sequence-layout.md` — кастомный движок vs ELK post-processor.
- [ ] `docs/adr/0002-undo-granularity.md` — атомарные команды vs семантическая группировка typing-burst.
- [ ] `docs/adr/0003-plantuml-subset.md` — какое подмножество PlantUML поддерживается в MVP.
- [ ] `docs/adr/0004-collab-readiness.md` — checklist готовности к Yjs/CRDT (immutable updates, явные команды).
- [ ] `docs/adr/0005-drilldown-out-of-scope.md` — sub-diagrams (drill-down C4) исключены из MVP.
- [ ] `docs/adr/0006-ai-extension.md` — AI-помощник как отдельный пакет/расширение.
- [ ] `docs/design/interaction-matrix.md` — touch/mobile UX: избегаем hover-only, hover-only взаимодействия запрещены.

---

## 20. Карта пакетов и ключевых файлов

```
uml-drawerjs/
├─ pnpm-workspace.yaml
├─ package.json                          # root, "private": true
├─ tsconfig.base.json                    # strict + ES2022
├─ .changeset/config.json
├─ .github/workflows/{ci,release,deploy-playground}.yml
├─ packages/
│  ├─ theme/                              # design-agnostic theming contract ONLY
│  │  └─ src/{contract.css, defaults-light.css, defaults-dark.css, tokens.json, README.md}
│  ├─ core/
│  │  └─ src/
│  │     ├─ model/{types.ts, immutable.ts, ids.ts, schema.ts, index.ts}
│  │     ├─ parser/{plantuml.grammar, builder.ts, meta.ts, index.ts}
│  │     ├─ generator/{c4.ts, class.ts, er.ts, sequence.ts, format.ts, index.ts}
│  │     ├─ validators/{syntax.ts, semantic.ts, constraints.ts, lint.ts, quickfix.ts, index.ts}
│  │     ├─ layout/{elk.ts, sequence.ts, fallback.ts, index.ts}
│  │     ├─ renderer/{svg.ts, nodes/, edges/, panZoom.ts, minimap.ts, a11y.ts, index.ts}
│  │     ├─ commands/{base.ts, addNode.ts, removeNode.ts, ..., index.ts}
│  │     ├─ history/{stack.ts, coalesce.ts, index.ts}
│  │     ├─ exporters/{puml.ts, svg.ts, png.ts, json.ts, index.ts}
│  │     └─ editor/{createEditor.ts, options.ts, index.ts}
│  ├─ codemirror-plantuml/
│  │  └─ src/{language.ts, highlight.ts, lint.ts, autocomplete.ts, snippets.ts, index.ts}
│  └─ react/
│     └─ src/{UmlEditor.tsx, Canvas.tsx, Palette.tsx, PropsPanel.tsx,
│              TextEditor.tsx, Outline.tsx, HUD.tsx, CommandChannel.tsx,
│              Statusbar.tsx, hooks/, index.ts}
├─ apps/
│  ├─ playground/
│  │  └─ src/
│  │     ├─ App.tsx, layout/, hud/, channel/, samples/, index.html
│  │     └─ skins/cyber-topographic/      # P13a — showcase skin, NOT in npm
│  │        └─ {tokens.css, mapping.css, bg.css, fonts.css, decorations.css, index.css, README.md}
│  └─ docs/                              # VitePress / Starlight
└─ docs/
   ├─ uml-drawer.md                      # источник требований
   ├─ design/02-cyber-topographic.html   # визуальный референс
   ├─ IMPLEMENTATION_PLAN.md             # этот файл
   └─ adr/000{1..6}-*.md
```

---

## 21. Покрытие требований спеки

| Пункт спеки | Где реализуется |
|---|---|
| FR1 — 5 типов диаграмм | P2 (AST), P4/P5 (parser/generator), P6 (constraints), P8 (renderer) |
| FR2 — категоризованная палитра | P12 (`<Palette>` + `paletteFilter`), P13 (playground) |
| FR3 — двунаправленная синхронизация | P3 (CQRS), P4 (incremental parser), P10 (createEditor `onChange`) |
| FR4 — drag&drop из палитры | P12 (`<Palette>` + `<Canvas>` drop handlers), P14 (E2E) |
| FR5 — редактирование связей | P8 (port snapping), P6 (constraints validator) |
| FR6 — панель свойств | P12 (`<PropsPanel>`) |
| FR7 — auto-layout (ELK.js) | P7 |
| FR8 — экспорт PUML/SVG/PNG/JSON | P9 |
| FR9 — импорт PUML/JSON | P9 (`importPuml`, `importJson`) |
| FR10 — undo/redo + горячие клавиши | P3 (history) + P12 (key bindings) + P14 (E2E) |
| FR11 — zoom/pan/minimap | P8 |
| FR12 — темы и кастомные стили (theming contract) | P1 (contract + neutral defaults), P10 (`applyTheme`), P8 (CSS-vars styling), P12 (адаптер использует только `--uml-*`) |
| FR13 — валидация (4 уровня) | P6 |
| NFR — design-agnostic library | P1 (contract), P8 (renderer), P12 (адаптер); verified в P14 (design-agnostic guard + library-only visual baseline) |
| NFR — cyber-topographic showcase | **P13a** (отдельный скин в playground), визуально проверяется в P13 + showcase visual regression в P14 |
| NFR — performance 60 FPS / <50 мс | P7/P8 + P14 (бенч) |
| NFR — bundle ≤ 500 KB gzip | P14 (`size-limit`); скин в бюджет не входит |
| NFR — TypeScript strict | P0/P2 |
| NFR — tree-shakeable ESM | P2 (`sideEffects: false`) |
| NFR — accessibility | P8 (ARIA + keyboard) + P14 (axe-core) |
| NFR — MIT + npm | P15 |

---

## 22. Verification

После каждой завершённой фазы:

1. Релевантные unit/E2E/visual-regression-наборы зелёные.
2. Performance-бенчи в budget (`pnpm bench`).
3. `size-limit` в budget.
4. Чек-лист этой фазы переведён в ✅.
5. Ссылки и пути в этом плане синхронизированы с реальной структурой репозитория.

В конце MVP (после P13):
- Playground задеплоен и доступен по public-URL.
- npm-релиз `0.1.0` опубликован под `@uml-drawer/{core,react,codemirror-plantuml,theme}`.
- API-reference сгенерирован TypeDoc и встроен в docs.

---

*Last updated: 2026-05-08 — Phase 0 complete.*
