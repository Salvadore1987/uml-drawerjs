# C4 node extras round-trip (`stereotype`, per-kind `technology`)

## Context

В downstream-приложении (arch-vision) на C4 Context диаграмме при редактировании у узла полей `stereotype` или `technology` через `<PropsPanel/>` правка визуально «применяется», но при следующем парсе сбрасывается. Корень — в `@uml-drawer/core`: C4-генератор не эмитит эти поля в PlantUML, потому что у стандартных макросов `Person`, `Person_Ext`, `System`, `System_Ext` нет под них слотов. AST в памяти получает обновление через `updateNodeCommand`, но при `generatePlantUml` поля молча отбрасываются, и при следующем `parsePlantUml` восстановить их неоткуда.

**Матрица потерь** (см. `src/generator/c4.ts`, в opaque build — `dist/generator/index.js:88-157`):

| kind узла                                             | stereotype             | technology                                | description     |
| ----------------------------------------------------- | ---------------------- | ----------------------------------------- | --------------- |
| `person`, `person-external`                           | ❌ нет слота в макросе | ❌ нет слота                              | ✅ 3-й аргумент |
| `system`, `system-external`                           | ❌ нет слота           | ❌ нет слота                              | ✅ 3-й аргумент |
| `database` без tech, `queue` без tech                 | ❌ нет слота           | ✅ задание → переключение на `*Db/*Queue` | ✅              |
| `container*`, `component*`, `database`/`queue` с tech | ❌ нет слота           | ✅ 3-й аргумент макроса                   | ✅ 4-й аргумент |

Description у Person/System round-trip-ится корректно (3-й аргумент макроса) — отдельной правки не требует. Если репродукция покажет потерю — расширить тем же механизмом.

## Goal

Сохранять `stereotype` и (для Person/System-семейства) `technology` через round-trip PlantUML → AST → редактирование → PlantUML → AST. Решение должно:

- не вводить новых публичных API/типов;
- не ломать существующие диаграммы и тесты `layoutOverrides` / `styles`;
- быть инвариантным к realloc id при перепарсе.

## Non-goals

- Не менять формат `' @drawer:meta` (он уже произвольный JSON-объект, см. `src/parser/meta.ts` / `chunks/meta-Cih8e3h3.js`).
- Не править генераторы class / er / sequence (у них собственные механизмы для stereotype через `<<...>>`).
- Не менять публичные типы `Diagram` / `Node` — `stereotype?: string` и `technology?: string` уже допустимы.

## Design

В библиотеке есть готовый канал sidecar-метаданных — meta-комментарий `' @drawer:meta {...}` (formatter/parser — `chunks/meta-Cih8e3h3.js`). Через него уже едут `layoutOverrides` и `styles`. Расширяем payload новым необязательным ключом:

```ts
type DrawerMetaPayload = {
  layoutOverrides?: Record<string, /* alias */ unknown>;
  styles?: Record<string, /* alias */ unknown>;
  nodeExtras?: Record<
    string /* alias */,
    {
      stereotype?: string;
      technology?: string;
      // description зарезервирован: писать только если round-trip потерян
    }
  >;
};
```

Ключ хранится по alias-ам (как `layoutOverrides`/`styles`), чтобы переживать realloc id при перепарсе. Применяется на этапе `finalize`, когда все узлы созданы и aliases резолвнуты.

## Changes

### `src/generator/c4.ts` (генератор C4) и сборщик meta

В функции `formatDiagramMeta` (в opaque build — `dist/generator/index.js:33`), которая сейчас собирает payload только из `layoutOverrides` и `styles`, добавить сбор «потерянных» полей C4-узлов:

```ts
const PERSON_SYSTEM = new Set(["person", "person-external", "system", "system-external"]);

function collectC4NodeExtras(
  diagram: Diagram,
  aliasIndex: Map<string, string>,
): Record<string, { stereotype?: string; technology?: string }> | null {
  if (
    diagram.type !== "c4-context" &&
    diagram.type !== "c4-container" &&
    diagram.type !== "c4-component"
  ) {
    return null;
  }
  const result: Record<string, { stereotype?: string; technology?: string }> = {};
  for (const node of diagram.nodes) {
    const extras: { stereotype?: string; technology?: string } = {};
    // stereotype не выражается ни одним из C4-макросов → всегда едет sidecar'ом
    if (node.stereotype) extras.stereotype = node.stereotype;
    // technology в Person/System семействе теряется; у Container/Component
    // technology уже находится в макросе и дублировать не нужно.
    if (PERSON_SYSTEM.has(node.kind) && node.technology) {
      extras.technology = node.technology;
    }
    if (Object.keys(extras).length > 0) {
      const alias = aliasIndex.get(node.id) ?? aliasFromId(node.id);
      result[alias] = extras;
    }
  }
  return Object.keys(result).length > 0 ? sortRecord(result) : null;
}
```

В самой `formatDiagramMeta`:

- собрать `nodeExtras = collectC4NodeExtras(diagram, aliasIndex)`;
- расширить гард «нечего эмитить» условием `hasExtras = nodeExtras !== null`;
- при `hasExtras` положить `payload.nodeExtras = nodeExtras` рядом с `layoutOverrides`/`styles`.

`aliasIndex` уже строится в этой же функции через `buildAliasIndex(diagram)` — переиспользовать.

### `src/parser/index.ts` (парсер meta-комментариев и finalize)

1. Расширить `ParseContext`: `nodeExtras: Record<string, { stereotype?: string; technology?: string }> | null` (init `null`).
2. В `handleMetaComment` (в opaque build — `dist/parser/index.js:1279-1294`) после блоков `layoutOverrides` / `styles` добавить:

   ```ts
   const extras = result.payload.nodeExtras;
   if (extras && typeof extras === "object" && !Array.isArray(extras)) {
     ctx.nodeExtras = { ...(ctx.nodeExtras ?? {}), ...extras };
   }
   ```

3. В `finalize` (в opaque build — `dist/parser/index.js:45-66`), до сборки `diagram`, применить:

   ```ts
   if (ctx.nodeExtras) {
     for (const [alias, extras] of Object.entries(ctx.nodeExtras)) {
       const id = ctx.aliases.get(alias);
       if (!id) continue;
       const node = ctx.nodes.find((n) => n.id === id);
       if (!node) continue;
       if (typeof extras.stereotype === "string") {
         node.stereotype = extras.stereotype;
       }
       // не затирать technology, разобранную из макроса
       if (typeof extras.technology === "string" && node.technology === undefined) {
         node.technology = extras.technology;
       }
     }
   }
   ```

   Условие `node.technology === undefined` оставляет приоритет за макросом — на случай если будущая версия C4-PlantUML добавит technology в Person/System.

### Без изменений

- `src/parser/meta.ts` (`isMetaComment`, `parseMetaComment`, `formatMetaComment`) — формат и сериализация уже подходят.
- Генераторы `class` / `er` / `sequence` — не трогаем.
- Публичные типы `Diagram` / `Node`.

## Edge cases

- **Alias из meta не соответствует ни одному узлу** (узел переименовали, текстовый редактор не подчистил meta) — пропускаем тихо, поведение такое же, как с `layoutOverrides`.
- **`nodeExtras` для kind, у которого technology уже разобрана из макроса** — условие `node.technology === undefined` защищает.
- **Старые диаграммы без `nodeExtras` в payload** — payload не содержит ключа, поведение прежнее.
- **Невалидный `nodeExtras` JSON** — `parseMetaComment` уже валидирует, что payload — объект; неподходящие значения внутри `nodeExtras` молча игнорируются (защищено `typeof === "string"`).
- **C4 boundary / group** — не трогаем, у них нет `stereotype`/`technology`.

## Acceptance

- **Unit-тесты генератора C4**:
  - `system` с `stereotype="domain"` → в выводе строка `System(<alias>, "...")` плюс meta-строка с `nodeExtras.<alias>.stereotype === "domain"`.
  - `person` с `technology="Browser"` → `Person(<alias>, "...")` без 4-го аргумента, в meta `nodeExtras.<alias>.technology === "Browser"`.
  - `container` с `technology` — technology в макросе как сейчас, в `nodeExtras` НЕ дублируется.
- **Unit-тесты парсера**: вход — вывод генератора, на выходе AST с восстановленными `stereotype` / `technology`.
- **Round-trip**: для C4-AST с произвольным набором узлов `parse(generate(ast))` совпадает с `ast` по полям `stereotype` / `technology`.
- **Regression**: существующие тесты `layoutOverrides`, `styles`, `descriptions` остаются зелёными.

## Verification (downstream)

После релиза и bump в `arch-vision`:

1. Открыть C4 Context диаграмму.
2. Добавить `Software System`, задать description / stereotype / technology, дождаться автосейва (~1.5 с).
3. В табе **PlantUML** убедиться, что meta-строка содержит `nodeExtras` с заданными значениями.
4. Перезагрузить страницу → выбрать тот же узел → поля сохранены.
5. Повторить для `Person`, `System_Ext`, `Person_Ext`, `Container`, `Component`.
6. Открыть Class диаграмму — stereotype через `<<...>>` отображается как раньше, `nodeExtras` для классов не эмитится.
