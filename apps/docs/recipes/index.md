# Embedding the editor

Drop the React adapter into any React 18+ app. The editor is design-agnostic — it inherits its look from `--uml-*` tokens you provide.

## Minimal embed

```tsx
import { UmlEditor, Canvas, Palette, PropsPanel } from "@uml-drawer/react";
import "@uml-drawer/react/styles.css";
import "@uml-drawer/theme";

export function DiagramPanel({
  diagram,
  onChange,
}: {
  diagram: string;
  onChange: (text: string) => void;
}) {
  return (
    <UmlEditor
      diagramType="class"
      value={diagram}
      onChange={(event) => onChange(event.text)}
      theme="auto"
    >
      <Palette />
      <Canvas />
      <PropsPanel />
    </UmlEditor>
  );
}
```

## Iframe embed (e.g. inside docs)

```html
<iframe
  src="https://your-host.example/playground/"
  title="UML Drawer JS Playground"
  width="100%"
  height="640"
  loading="lazy"
  style="border: 1px solid var(--vp-c-divider); border-radius: 8px;"
></iframe>
```

The playground responds to `data-theme="dark" | "light"` on its body, so postMessaging the host theme is straightforward.

## Headless export (no UI)

```ts
import { createEditor } from "@uml-drawer/core/editor";

const host = document.createElement("div");
const editor = createEditor(host, { diagramType: "class" });
await editor.loadFromText(plantUmlSource);
const svgString = editor.exportSvg({ themeStyleBlock });
editor.destroy();
host.remove();
```

See also the [headless API recipe](./headless).
