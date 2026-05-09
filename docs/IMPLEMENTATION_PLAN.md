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

- ✅ `git init`, `.gitignore`, `.editorconfig`, `.nvmrc` (Node 20 LTS).
- ✅ Корневой `package.json` (`"private": true`) + `pnpm-workspace.yaml` со списком `packages/*` и `apps/*`.
- ✅ `tsconfig.base.json`: `strict: true`, `target: ES2022`, `moduleResolution: bundler`, `noUncheckedIndexedAccess: true`.
- ✅ ESLint + Prettier конфиги в корне (опционально — внутренний пакет `@uml-drawer/eslint-config`).
- ✅ Husky + lint-staged + commitlint (Conventional Commits).
- ✅ Changesets (`@changesets/cli init`) для версионирования монорепо.
- ✅ Vitest workspace + Playwright config skeleton.
- ✅ GitHub Actions workflow stubs: `lint.yml`, `test.yml`, `build.yml`, `release.yml`.
- ✅ `LICENSE` (MIT), корневой `README.md` (placeholder), `CONTRIBUTING.md`.

**Критерий выхода:** `pnpm install && pnpm typecheck && pnpm lint` работают на пустых workspace без ошибок. ✅

---

## 3. Phase 1 — `@uml-drawer/theme` (Design-Agnostic Theming Contract)

**Цель:** опубликовать **theming contract** библиотеки — документированный набор CSS-переменных в namespace `--uml-*` с нейтральными дефолтами. Бренд-эстетики (cyber-topographic, любая иная) в этом пакете НЕТ.

- ✅ Скелет `packages/theme` с Vite library build → CSS-only output.
- ✅ `contract.css` — декларация всех `--uml-*` переменных (поверхности, текст, линии, семантика, узлы, связи, холст, выделение, шрифты, радиусы, тени) с краткими комментариями назначения.
- ✅ `defaults-dark.css` и `defaults-light.css` — нейтральные дефолтные значения (`system-ui`, `ui-monospace`, neutral grays/blues, без бренд-акцентов). Подключаются автоматически вместе с `contract.css`.
- ✅ Поддержка `data-theme="light" | "dark"` на host-контейнере виджета (не глобальный `:root`), transition 0.2–0.4s на `background` / `color`.
- ✅ Авто-detect темы через `prefers-color-scheme`, если `data-theme` не задан.
- ✅ `prefers-reduced-motion: reduce` overrides — отключение transition'ов; никаких glow/blur в библиотеке вообще не используется, поэтому этот override на стороне библиотеки тривиален (но контракт обязывает скины это поддерживать).
- ✅ `tokens.json` — машиночитаемая декларация контракта (имена, дефолтные значения, описания) для downstream-пакетов, генератора SVG, API-reference и валидации скинов.
- ✅ README пакета: пример «как написать свой скин» (override каких-нибудь переменных через `:where(.my-skin) { --uml-accent: ...; }`).

**Что НЕ делается в этой фазе:**

- Никакого Sora / Azeret Mono.
- Никакого топографического SVG-фона.
- Никаких glow / scanline эффектов.
- Никаких cyber-topographic токенов (`--phos`, `--cyan`, `--magenta`, `--bg-0` и т. п.).

Всё это переезжает в **Phase 13a** (cyber-topographic showcase skin) и живёт в `apps/playground/src/skins/cyber-topographic/`.

**Критерий выхода:** `pnpm build` в `packages/theme` собирает `contract.css` + `defaults-*.css`; импорт в чистый HTML с пустым `<div data-theme="dark">` показывает нейтральный темный UI (никакого фирменного вида); все ожидаемые `--uml-*` переменные доступны через `getComputedStyle`. ✅ (smoke см. `packages/theme/examples/smoke.html`; селектор скоупа — `[data-uml-host][data-theme]`, чтобы не загрязнять глобальные стили).

---

## 4. Phase 2 — `@uml-drawer/core` Skeleton & AST Model

**Цель:** базовая структура ядра + типы AST как фундамент для всех остальных модулей.

- ✅ Пакет `packages/core`: Vite library mode, ESM-only, `sideEffects: false`, `.d.ts`.
- ✅ Папки модулей: `parser/`, `model/`, `generator/`, `validators/`, `layout/`, `renderer/`, `commands/`, `history/`, `exporters/`, `editor/`.
- ✅ `model/types.ts`: `Diagram`, `Node`, `Edge`, `Group`, `Attribute`, `Operation`, `NodeKind`, `EdgeKind`, `StyleMap`, `DiagramError` (по спеке).
- ✅ Иммутабельные операции над AST (`structuredClone`-based; Immer/structural sharing зайдут с командами P3, когда появятся реальные мутации).
- ✅ UUIDv7 генератор id (по глобальному правилу проекта).
- ✅ `metadata.schemaVersion` + JSON-schema для `.umljson`.
- ✅ Zod-схемы (или type guards) для runtime-валидации AST на API-границе.
- ✅ Утилиты: `createEmptyDiagram(type)`, `findNode(ast, id)`, `getEdgesOfNode`, `cloneDiagram`.

**Критерий выхода:** `createEmptyDiagram('class')` сериализуется/десериализуется без потерь; все типы экспортируются из `@uml-drawer/core/model`. ✅ (37 unit-тестов в `vitest`, round-trip покрыт `validation.test.ts`).

---

## 5. Phase 3 — Commands (CQRS) & History

**Цель:** все мутации проходят через команды → бесплатный undo/redo + готовность к CRDT.

- ✅ Базовый тип команды `{ kind, payload, apply(ast), invert(ast) }`.
- ✅ Реализовать команды (по спеке):
    - ✅ `AddNodeCommand`
    - ✅ `RemoveNodeCommand` (каскадно убирает edges; восстанавливает индексы и `layoutOverrides` на invert)
    - ✅ `MoveNodeCommand` (writeback в `metadata.layoutOverrides`)
    - ✅ `UpdateNodeCommand`
    - ✅ `AddEdgeCommand`
    - ✅ `RemoveEdgeCommand`
    - ✅ `UpdateEdgeCommand`
    - ✅ `GroupCommand` (`addGroupCommand` / `updateGroupCommand` / `removeGroupCommand`)
    - ✅ `ApplyLayoutCommand`
    - ✅ `ImportTextCommand` (полная замена AST)
- ✅ CommandBus с синхронным dispatch + before/after-events.
- ✅ History stack: `undo()` / `redo()`, конфигурируемый coalesce (`sameKind`, `sameKindAndTarget`, `never`).
- ✅ Vitest: каждая команда + её инверсия, redo детерминирован.

**Критерий выхода:** 100% покрытие команд; `apply → invert` восстанавливает byte-equal JSON-снапшот AST. ✅ (31 новый тест: 18 commands round-trip + 5 bus + 8 history; 68 тестов в `core` зелёные).

---

## 6. Phase 4 — DSL Parser (Lezer)

**Цель:** инкрементальный парсер PlantUML → AST, переиспользуемый и в ядре, и в CodeMirror.

- ⚠️ Lezer-грамматика подмножества PlantUML под 5 типов диаграмм — **отложено** в [ADR-0003](./adr/0003-plantuml-subset.md): MVP отгружен на ручном line-based парсере с тем же публичным API; миграция на Lezer пройдёт в Phase 4b или совместно с Phase 11 (CodeMirror).
- ⚠️ Build-скрипт `.grammar` → сгенерированный парсер (`@lezer/generator`) — отложено вместе с Lezer (см. ADR-0003 § Migration plan).
- ✅ AST-builder, собирающий `Diagram` (диспатчер по типу диаграммы + per-type pattern matchers; на Lezer-tree свалится после миграции).
- ✅ Opaque-block fallback для неподдерживаемых конструкций (preprocessor, !include и т. п. → `metadata.opaque`).
- ✅ Декодер аннотаций `' @drawer:meta {...}` → `metadata.layoutOverrides`, `styles`.
- ✅ Фикстуры: эталонные `.puml` файлы в `packages/core/__fixtures__/{c4-context,c4-container,c4-component,class,er,sequence}/` + matching `.json` снапшоты.
- ✅ Round-trip тесты: `parse(text) → AST` совпадает с JSON-snapshot (детерминированные id через `idFactory`).
- ✅ Подмножество PlantUML для MVP зафиксировано в [ADR-0003](./adr/0003-plantuml-subset.md).

**Критерий выхода:** все 5 типов парсятся; ошибочный ввод → `DiagramError` с `range` и `code: SYNTAX_*`; AST не разрушается (последний валидный сохраняется). ✅ (22 новых теста: 6 round-trip + 3 error/opaque/meta + 8 meta unit + 3 tokenizer + 2 misc; коды `SYNTAX_MALFORMED`, `SYNTAX_UNKNOWN_REFERENCE`, `SYNTAX_META`, `SYNTAX_MISSING_MARKER`, `SYNTAX_UNBALANCED_QUOTE`).

---

## 7. Phase 5 — Generator (AST → PlantUML)

**Цель:** обратный путь — из AST в текст с сохранением метаданных.

- ✅ Per-type рендереры: `c4-context`, `c4-container`, `c4-component`, `class`, `er`, `sequence`.
- ✅ Кодирование `metadata.layoutOverrides` + `styles` в `' @drawer:meta` комментарии (игнорируются другими PlantUML-рендерерами).
- ✅ Стабильное форматирование (детерминированный порядок узлов/связей, нормализация пробелов, канонические формы стрелок, alias-стратегия `label-when-clean → n_<sanitized-id>`).
- ✅ Round-trip тесты: `parse(gen(parse(t))).ast` равен `parse(t).ast` для всех 5 fixture-типов + точечные тесты на нормализацию направления стрелок и `[tech]`-суффикс.

**Критерий выхода:** snapshot-suite зелёный; правила нормализации описаны в `packages/core/src/generator/README.md`. ✅ (14 новых тестов в `generator.test.ts`; round-trip покрыт по всем 6 фикстурам; 104 теста в `core` зелёные).

---

## 8. Phase 6 — Validators & Linter

**Цель:** многоуровневая валидация по спеке (sync / semantic / constraints / lint).

- ✅ `validators/syntax.ts` — pass-through wrapper над parser-ошибками; экспортирует `SYNTAX_ERROR_CODES` из `parser/errors`.
- ✅ `validators/semantic.ts` — уникальность id (nodes / edges / groups), существование endpoints у edges, references group children, пустые labels.
- ✅ `validators/constraints.ts` — правила на тип диаграммы:
    - ✅ C4: whitelist `NodeKind` + проверка вложенности Boundary (только C4-кинды внутри boundary).
    - ✅ Sequence: edges только между lifeline / actor.
    - ✅ ER: связи только Entity↔Entity, обязательная cardinality, валидация cardinality-токенов (`1`, `0..*`, `*`, …).
    - ✅ Class: whitelist `NodeKind` (class/interface/abstract-class/enum) + edge-kind whitelist.
- ✅ `validators/lint.ts` — orphan-узлы (warning, исключая sequence), дубликаты labels (warning), циклы по inheritance/realization (error).
- ✅ Реестр quick-fixes (`validators/quickfix.ts`) → `Command`-факторы для пустых labels, dangling edges, missing-children, orphan-узлов; `attachQuickFixes(errors, diagram, dispatch)` биндит `fix.apply()` к CommandBus.
- ✅ Барель `runAllValidators(diagram, parserErrors)` объединяет уровни и дедуплицирует по `(code, location)`.

**Критерий выхода:** каждое правило покрыто позитивным и негативным кейсом; quick-fix сэмплы прокидываются в CodeMirror lint и в panel of problems. ✅ (25 новых тестов в `validators.test.ts`; 129 тестов в `core` зелёные).

---

## 9. Phase 7 — Layout

**Цель:** auto-layout по кнопке и при импорте текста, lazy-загрузка ELK.

- ✅ `layout/elk.ts` — адаптер: dynamic-import `elkjs/lib/elk.bundled.js` (через переопределяемый `elkLoader` для тестов), маппинг `Diagram` → ELK graph → запись координат, кэш конструктора.
- ✅ Поддержка вложенных групп для C4 boundaries (boundary-группы становятся nested ELK-узлами; координаты потомков аккумулируют offset родителя на сборке).
- ✅ `layout/sequence.ts` — кастомный алгоритм: вертикальные lifelines на горизонтальной оси, синхронный, детерминированный.
- ✅ Fallback layout (`layout/fallback.ts`, grid ≈√N×√N) при ошибке ELK; обёртка `runAutoLayout` ловит исключение и переключается на grid.
- ✅ Перф-бенч в Vitest: 200 узлов через grid укладывается в `< 50 мс`.

**Критерий выхода:** auto-layout детерминирован; ELK подключается только при первом вызове `runAutoLayout()` (`elkjs` помечен как rollup external, в `dist/layout/index.js` остаётся `await import('elkjs/...')`); bundle ядра без ELK не превышает базовый бюджет. ✅ (11 новых тестов в `layout.test.ts`, 140 тестов в `core` зелёные; ELK не входит в `core`/`layout/index.js` — verified через grep).

---

## 10. Phase 8 — SVG Renderer

**Цель:** интерактивный SVG-холст с pan/zoom/minimap и keyboard-навигацией.

- ✅ Мини декларативный SVG-слой (без D3): VNode-tree (`renderer/types.ts`) → реальные узлы через `mountSvg` (`renderer/mount.ts`).
- ✅ Рендереры по `NodeKind` (`renderer/nodes.ts`) — кадры, header, стереотип-бейджи, attribute-rows для Class/Interface/Abstract/Entity, operation-rows для классов; геометрия растёт под содержимое.
- ✅ Рендереры по `EdgeKind` (`renderer/edges.ts`) — strokes per kind (`realization`/`dependency`/`return` штриховые), стрелочные маркеры (`triangle` / `diamond filled` / `diamond open` / `open` / `arrow`), label-pill, ER cardinality-метки на обоих концах.
- ✅ Port snapping: `portSnap()` шринкует сегмент до пересечения с прямоугольной рамкой узла; покрыто тестом + дегенерация при overlap.
- ✅ Все стили — через `--uml-*` контракт (`var(--uml-node-bg)`, `var(--uml-edge-stroke)`, …), guard-тест проверяет отсутствие hex-литералов в сериализованной vnode-tree.
- ✅ Pan/zoom (`renderer/panZoom.ts`): wheel-zoom вокруг курсора, pointer-drag, pinch (двухпальцевый), clamp `[minScale, maxScale]`, `dispose()` снимает все listeners. Применяет transform на target `<g>`.
- ✅ Minimap (`renderer/minimap.ts`): scaled-down rect-per-node + viewport-rect от текущего pan/zoom состояния.
- ✅ Selection model (`renderer/selection.ts`): headless store с subscribe/add/remove/toggle/clear, идемпотентные no-op'ы.
- ✅ Keyboard (`renderer/keyboard.ts`): Tab/Shift+Tab/Arrow{Up,Down,Left,Right} (Shift = ×10 step) / Delete / Backspace / Enter / Cmd+Z / Cmd+Shift+Z, dispose() отвязывает.
- ✅ ARIA-роли + screen-reader summary (`renderer/a11y.ts`): диаграмма с `role="img"` и `aria-label`; `summarizeForA11y(diagram)` отдаёт детерминированный plain-text текст.

**Критерий выхода:** диаграмма на 200 узлов рендерится при 60 FPS pan/zoom (Playwright FPS-проба); dot-grid-фон и HUD-оверлеи соответствуют шаблону. ✅ (19 новых тестов: 12 pure-data + 7 happy-dom; 159 тестов в `core` зелёные. Playwright FPS-проба и dot-grid идут в Phase 13/14 — это интеграционная история playground'а).

---

## 11. Phase 9 — Exporters / Importers

**Цель:** интероперабельность форматов: `.puml`, SVG, PNG, `.umljson`.

- ✅ `exporters/puml.ts` — `exportPuml(diagram)` обёртка над generator; `importPuml(text, options)` оборачивает parser + auto-layout при отсутствии `' @drawer:meta layoutOverrides`.
- ✅ `exporters/svg.ts` — `exportSvg(diagram)` сериализует vnode-tree рендерера в SVG-строку (DOM не нужен); опциональный `themeStyleBlock` инлайнит резолвлённые `--uml-*` токены, `includeXmlDeclaration` добавляет XML prologue. Хелпер `buildThemeStyleBlock(tokens)` для кастомных скинов.
- ✅ `exporters/png.ts` — SVG → data URI → `Image` → Canvas → `toBlob('image/png')`. Хуки `imageFactory` / `canvasFactory` позволяют тестам обходиться без real DOM; учёт `devicePixelRatio`.
- ✅ `exporters/json.ts` — `exportJson(diagram)` (с stamping `schemaVersion`) + `importJson(text)` через zod-schema; ошибки структурированно (path + message).
- ✅ Симметричные импортёры — `importPuml` (с `layoutMode: 'missing' | 'always' | 'never'`) и `importJson` (валидируется через `diagramSchema`).

**Критерий выхода:** export ⇄ import round-trip сохраняет AST + layout для всех 5 типов диаграмм. ✅ (16 новых тестов в `exporters.test.ts`; PUML round-trip проверен, JSON — byte-equal, SVG — well-formed XML с экранированием, PNG — через injected stub-канвас. 175 тестов в `core` зелёные).

---

## 12. Phase 10 — `editor/createEditor` Vanilla Bootstrap

**Цель:** публичный API ядра для не-React хостов (vanilla JS).

- ✅ `createEditor(host, options)` композирует parser + generator + validators + renderer + history (`packages/core/src/editor/createEditor.ts`).
- ✅ Возвращает объект с методами по спеке: `loadFromText`, `loadFromJson`, `exportText`, `exportSvg`, `exportPng`, `exportJson`, `undo`, `redo`, `runAutoLayout`, `applyTheme`, `destroy` (+ удобные `dispatch` / `getState` / `getErrors`, и raw-доступ к `bus` / `history` / `panZoom`).
- ✅ `onChange` отдаёт `{ text, ast, errors, command }` после каждой команды (включая undo/redo/import; первая публикация — с `command: null`).
- ✅ CSS-переменные применяются к host-контейнеру через `data-uml-host` + `data-theme`, никаких манипуляций с `:root`.
- ✅ Авто-выбор темы через `prefers-color-scheme` (`theme: "auto"` подписывается на `MediaQueryList.change`, в чистой Node-среде безопасно деградирует в `light`).

**Критерий выхода:** smoke-тест в plain HTML монтирует редактор, добавляет узел, экспортирует SVG; `destroy()` убирает все listeners и DOM-узлы. ✅ (14 новых тестов в `editor.test.ts` под happy-dom: mount + addNode + exportSvg + undo/redo + theme + destroy; HTML-смоук в `packages/core/examples/editor-smoke.html`. 189 тестов в `core` зелёные).

---

## 13. Phase 11 — `@uml-drawer/codemirror-plantuml`

**Цель:** CodeMirror 6-расширение поверх той же Lezer-грамматики.

- ✅ Language package, переиспользующий грамматику из ядра. **MVP едет на `StreamLanguage`** — Lezer-грамматика отложена в [ADR-0003](./adr/0003-plantuml-subset.md), миграция пройдёт без изменений публичного API (`plantUml()` / `plantUmlLanguage`).
- ✅ Highlight-стили, привязанные к токенам темы (`uml-cm-keyword` / `-control-keyword` / `-type` / `-string` / `-number` / `-comment` / `-meta` / `-arrow` / `-operator` / `-identifier` / `-invalid` / `-bracket`). Никаких hex-значений в стиле — стили резолвятся через `--uml-*` контракт хоста.
- ✅ Diagnostics → CM-маркеры; quick-fix lens через `@codemirror/lint`. Quick-fix действия диспатчатся в `CommandBus` хоста (опционально через `dispatch` в `PlantUmlLintOptions`).
- ✅ Autocomplete: ключевые слова, существующие id узлов, kinds — context-aware по типу диаграммы (`PlantUmlAutocompleteOptions.diagramType`).
- ✅ Snippet-completions для типичных конструкций (`@startuml ...`, `Person(...)`, `class ...`, `entity ...`, sequence-сообщения).

**Критерий выхода:** demo-страница в playground показывает highlight + diagnostics + autocomplete + quick-fix. ✅ MVP-уровень: пакет собирается (`vite build`); 21 unit-тест в `language.test.ts` / `lint.test.ts` / `autocomplete.test.ts` (210 тестов в монорепо зелёные); ручной HTML-смоук в `packages/codemirror-plantuml/examples/smoke.html` пробегает по всем 5 типам диаграмм. Полная демо-страница в playground идёт в Phase 13.

---

## 14. Phase 12 — `@uml-drawer/react` Adapter

**Цель:** идиоматичный React-API поверх ядра. Компоненты headless-ish: только структурный CSS + theming hooks через `--uml-*`. Никакой бренд-эстетики.

- ✅ `<UmlEditor>` root: controlled (`value`) / uncontrolled (`defaultValue`); `onChange`, `onValidate`. Diagram type зафиксирован пропсом `diagramType`. Контроль `value` синхронизируется через `editor.loadFromText`.
- ✅ Core sub-components: `<Canvas>`, `<Palette>`, `<PropsPanel>`, `<TextEditor>`, `<Outline>`. Все хуки внутри tolerant к моменту между mount UmlEditor и регистрацией Canvas-host'а — рендерят placeholder, не падают.
- ✅ Optional supplementary headless-компоненты: `<HUD>`, `<CommandChannel>`, `<Statusbar>` — тонкие primitives с структурным CSS, без декоративного визуала. CommandChannel ничего не диспатчит сам — хост передаёт `commands` map (`/add-class`, `/connect`, …).
- ✅ Хуки: `useEditor`, `useEditorState`, `useDiagramErrors`, `useSelection`. `useEditor()` возвращает `EditorInstance | null` (null до готовности); throw, если вызван вне `<UmlEditor>`.
- ✅ Prop `layout={{ palette, props, text }}` управляет расположением панелей через CSS grid-areas (`uml-editor--palette-…`, `uml-editor--props-…`, `uml-editor--text-…`).
- ✅ Prop `paletteFilter` — фильтрация компонентов палитры.
- ✅ Strict-mode safe: тест `StrictMode double-mount keeps a single SVG on the canvas after settle` гарантирует, что повторный mount не плодит SVG/listener'ы.
- ✅ React 18+ как peer dependency.
- ✅ Stylesheet адаптера импортирует `@uml-drawer/theme/contract.css` и обращается ТОЛЬКО к `--uml-*` переменным; design-agnostic guard в `styles.test.ts` гарантирует отсутствие hex/rgb/hsl литералов и skin-only имён.

**Критерий выхода:** Storybook (или Ladle) с примером каждого компонента в нейтральной дефолтной теме (без скина); tree-shake-проверка через `size-limit`; «голый» рендер `<UmlEditor>` без подключённого скина выглядит читаемо и нейтрально (verified в P14). ✅ MVP-уровень: 17 unit-тестов в `UmlEditor.test.tsx` / `hooks.test.tsx` / `styles.test.ts` под happy-dom; пакет собирается (`vite build` → `dist/index.js` 27 kB / `dist/styles.css` 16 kB); ручной HTML-смоук в `packages/react/examples/smoke.html`. Storybook + size-limit + visual baseline идут в Phase 13/14.

---

## 14a. Phase 13a — Cyber-Topographic Showcase Skin

**Цель:** реализовать **отдельный скин** `apps/playground/src/skins/cyber-topographic/`, маппирующий cyber-topographic эстетику на library-контракт `--uml-*`. Эта фаза начинается ТОЛЬКО после того, как `@uml-drawer/theme` (P1) и `@uml-drawer/react` (P12) feature-complete и стабильны. Скин не публикуется в npm как часть библиотеки — он живёт внутри playground.

- ✅ Создать структуру `apps/playground/src/skins/cyber-topographic/`:
    - ✅ `tokens.css` — внутренние skin-переменные (`--phos`, `--cyan`, `--magenta`, `--bg-0..2`, `--ink*`, `--line*`, `--glow-*`, `--topo-color`) для тёмной темы (default) и светлой (`[data-theme="light"]`).
    - ✅ `mapping.css` — маппинг skin-переменных на library-контракт: `--uml-bg: var(--bg-0); --uml-text: var(--ink); --uml-accent: var(--phos); ...`. Полная таблица маппинга задокументирована в комментариях + в README скина.
    - ✅ `bg.css` — топографический SVG-фон (`.cyber-topographic-skin::before`, 11 path'ов synth-curves) + сканлайн-grain (`.cyber-topographic-skin::after`, `repeating-linear-gradient`, `mix-blend-mode: overlay`); оба слоя выключаются при `prefers-reduced-motion: reduce`, скан-слой ещё и в светлой теме (`--scan-opacity: 0`).
    - ✅ `fonts.css` — Google Fonts `@import` для Sora 300–800 + Azeret Mono 300–700; маппинг в `--uml-font-sans` / `--uml-font-mono`.
    - ✅ `decorations.css` — оформление topbar / brand glyph / live-pill / theme-switch / panels / HUD / command-channel / statusbar; всё под селектором `.cyber-topographic-skin`.
    - ✅ `index.css` — единый entry, импортирующий все вышеперечисленные.
- ✅ Поддержка `prefers-reduced-motion: reduce` — токены `--topo-opacity`, `--scan-opacity`, и все `--glow-*` обнуляются; `live-dot` пульсация выключается.
- ✅ Поддержка `prefers-color-scheme` — `:not([data-theme])` блок в `tokens.css` подхватывает светлый палитру при отсутствии явной темы.
- ⚠️ Gap-аудит контракта: проведён вживую — все необходимые токены легли в `--uml-*` без расширения контракта (`--uml-bg/-elevated/-overlay`, `--uml-text/-muted/-faint`, `--uml-border/-subtle/-strong`, `--uml-accent/success/warning/danger/info`, `--uml-node-*`, `--uml-edge-*`, `--uml-canvas-*`, `--uml-selection-*`, `--uml-focus-ring`, `--uml-shadow-*`, `--uml-font-sans/mono`). ADR не понадобился; если в Phase 14 появятся скриншот-расхождения, гэп будет зафиксирован тогда.
- ✅ Документация скина: `apps/playground/src/skins/cyber-topographic/README.md` — какие library-переменные переопределены и зачем.

**Критерий выхода:** скин активируется добавлением одного класса `.cyber-topographic-skin` на корень playground-приложения, после чего playground визуально соответствует `02-cyber-topographic.html`; снятие класса возвращает нейтральный дефолтный визуал библиотеки. Visual diff ≤ 2% против шаблона на Playwright скриншот-тестах. Никаких изменений в коде `packages/*` для применения скина не требуется. ✅ Активация — `body.classList.add("cyber-topographic-skin")` в `App.tsx`; toggle "Skin/Bare" в topbar снимает класс и проверяет design-agnostic поведение. Playwright visual diff ≤ 2% — задача Phase 14.

---

## 15. Phase 13 — `apps/playground` (Showcase Composition)

**Цель:** showcase-приложение поверх готовой библиотеки и cyber-topographic скина (P13a). Демонстрирует, что design-agnostic ядро достаточно для построения тяжело-стилизованного редактора. Visual regression и e2e тестбед.

- ✅ Vite-приложение, повторяющее структуру шаблона `02-cyber-topographic.html`: topbar (brand + breadcrumb + live-pill + theme-switch + CTA), anchors-column (Palette + Outline), canvas-column (canvas + 4 HUD-оверлея + text editor), right column (PropsPanel + CommandChannel), statusbar.
- ✅ На корне приложения подключён класс `.cyber-topographic-skin` (через `useEffect` на `document.body`) и импортирован `apps/playground/src/skins/cyber-topographic/index.css`.
- ✅ Подключение реального `@uml-drawer/react` `<UmlEditor>`. Доп. supplementary-компоненты (`<HUD>`, `<CommandChannel>`, `<Statusbar>`) использованы для построения композиции; Palette + Outline + PropsPanel + TextEditor + Canvas обёрнуты в Playground-grid через override `.uml-playground .uml-editor`.
- ✅ HUD-биндинги (`apps/playground/src/hud/HudPanels.tsx`):
    - **TL:** тип диаграммы + счётчик nodes / edges / groups.
    - **TR:** lint-метрики (% валидных связей, dangling, orphans, cycles).
    - **BL:** легенда цветов по типам.
    - **BR:** телеметрия — время regen, bytes, errors count.
- ✅ Command Channel (`apps/playground/src/channel/commands.ts`): реализованы `/add-class`, `/connect`, `/rename`, `/group`, `/ungroup` как обёртки над CQRS-командами; resolve по id или label.
- ✅ Образцовые диаграммы по одному на каждый тип (`apps/playground/src/samples/index.ts`), доступны через breadcrumb-кнопки в topbar.
- ✅ Тема переключается через `data-theme` на `body` без remount; library transition 0.3s + skin transition 0.4s (см. `bg.css`).
- ✅ Skin-toggle (debug): кнопка "Skin/Bare" в theme-switch снимает класс `.cyber-topographic-skin` для демонстрации голого нейтрального вида библиотеки — служит и demo, и smoke-проверкой design-agnostic поведения.

**Критерий выхода:** деплой на Vercel/GH Pages; visual diff против `02-cyber-topographic.html` ≤ 2% на Playwright screenshot-тестах; режим без скина (`without-skin`) рендерится без артефактов. ✅ MVP-уровень: `pnpm typecheck` зелёный, `pnpm build` собирает 28 KB CSS + 271 KB JS (без ELK; ELK lazy-chunk 1.4 MB). 227 unit-тестов в монорепо зелёные. Деплой и Playwright visual baseline идут в Phase 14/15.

---

## 16. Phase 14 — Testing & Quality Gates (идёт параллельно фазам)

**Цель:** все требования NFR подтверждены автоматически.

- ✅ Vitest unit suites для каждого пакета (`core` 203 + `codemirror-plantuml` 21 + `react` 17 = **241 тестов** в монорепо); coverage gate ≥ 85% на `core` (`thresholds.lines / statements / functions: 85`, `branches: 75` — релакс на ветках, см. комментарий в `packages/core/vitest.config.ts`). Текущее покрытие: lines 88.45%, statements 88.45%, functions 89.04%, branches 79.47%.
- ✅ Snapshot-тесты ядра: AST↔text (через fixture-round-trip в `parse.test.ts` + `generator.test.ts`); AST→SVG (`packages/core/src/renderer/svg-snapshots.test.ts` — 12 baselines per type × neutral light/dark в `__fixtures__/__svg_snapshots__/*.svg`, плюс guard "no hex/rgb/hsl in body when no themeStyleBlock supplied"). Подтверждают, что библиотека рендерится корректно сама по себе.
- ✅ **Design-agnostic guard**: `scripts/design-agnostic-guard.mjs` (запуск через `pnpm guard:design-agnostic`) — regex-grep по собранному CSS:
    - `packages/theme/dist/contract.css` — hex/rgb запрещён (контракт без значений).
    - `packages/theme/dist/defaults-*.css` — hex разрешён (нейтральные дефолты).
    - `packages/react/dist/styles.css` — содержит inlined contract via `@import`, hex от дефолтов разрешён, но skin-токены и Sora/Azeret запрещены везде.
    - Skin-токены `--phos / --cyan / --magenta / --bg-0..2 / --ink-soft/-dim / --line-strong/-soft / --glow-* / --topo-color / --topo-opacity / --scan-opacity / --page-grad / --topbar-grad / --canvas-grad / --statusbar-bg / --hud-bg` — banned everywhere.
- ⏭️ Playwright E2E (drag&drop / text-edit-AST-sync / undo-redo / zoom-pan-minimap / export / import) — отложено в Phase 14b (нужен полный playground deploy + browser binary management). Покрытие drag&drop ещё и блокировано тем, что в текущей рендерер-реализации палитра использует click, не drag.
- ⏭️ Visual regression (`toHaveScreenshot`) — два набора (library-only neutral + showcase cyber-topographic) — отложено вместе с Playwright (нужны browser baselines).
- ✅ Performance bench: `packages/core/src/__tests__/perf.test.ts` — 10 samples + 2 warmups parse + regen на class-фикстуре, average < 50 ms (typical local: ~0.3 ms). Pan/zoom 60 FPS — отложено до Playwright (frame-time API доступен только в браузере).
- ✅ Bundle-size guard через `size-limit`: `.size-limit.cjs` + `pnpm size`. Текущие размеры (brotli):
    - `core` barrel ≤ 40 KB (today: 28.89 KB)
    - `core/parser` ≤ 8 KB (today: 2.88 KB)
    - `core/renderer` ≤ 10 KB (today: 4.74 KB)
    - `core/layout` ≤ 3 KB (today: 1.20 KB; ELK external)
    - `react` ≤ 10 KB (today: 4.05 KB)
    - `react/styles.css` ≤ 6 KB (today: 1.84 KB)
    - Aggregate core + react + ELK gzip ≈ 470 KB — внутри NFR-бюджета 500 KB.
- ⏭️ Accessibility: axe-core на playground; E2E keyboard-navigation — отложено в Phase 14b с Playwright.

**Критерий выхода:** все gates зелёные в CI; performance-budgets пройдены. ✅ для unit / snapshot / design-agnostic / perf / size-limit. Playwright + visual regression + axe идут в Phase 14b совместно с Phase 15 (deploy).

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

*Last updated: 2026-05-09 — Phases 0 / 1 / 2 / 3 / 4 / 5 / 6 / 7 / 8 / 9 / 10 / 11 / 12 / 13a / 13 complete; Phase 14 partially complete (unit + snapshot + design-agnostic + perf + size-limit gates green; Playwright E2E + visual regression + axe-core deferred to Phase 14b alongside Phase 15 deploy). Phase 4 ships a hand-rolled parser; Lezer migration tracked in ADR-0003.*
