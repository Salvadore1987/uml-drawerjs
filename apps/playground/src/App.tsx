import "@uml-drawer/react/styles.css";
import "./skins/cyber-topographic/index.css";
import "./App.css";

import type { DiagramType } from "@uml-drawer/core/model";
import {
  Canvas,
  CommandChannel,
  HUD,
  Outline,
  Palette,
  PropsPanel,
  Statusbar,
  TextEditor,
  UmlEditor,
} from "@uml-drawer/react";
import { useEffect, useState } from "react";

import { PLAYGROUND_COMMANDS } from "./channel/commands.js";
import { CanvasToolbar } from "./components/CanvasToolbar.js";
import { HudBottomLeft, HudBottomRight, HudTopLeft, HudTopRight } from "./hud/HudPanels.js";
import { DIAGRAM_TYPE_LABELS, DIAGRAM_TYPES, SAMPLES } from "./samples/index.js";

type Theme = "dark" | "light";

const SKIN_CLASS = "cyber-topographic-skin";

export function App(): JSX.Element {
  const [diagramType, setDiagramType] = useState<DiagramType>("class");
  const [theme, setTheme] = useState<Theme>("dark");
  const [skin, setSkin] = useState<boolean>(true);
  const [doc, setDoc] = useState<string>(SAMPLES.class);

  // Apply theme + skin class on the body so the topographic + scanline
  // decorative layers can live above the document gradient. Cleanup on
  // unmount restores a clean document — useful when the playground is
  // embedded as an iframe.
  useEffect(() => {
    document.body.dataset["theme"] = theme;
    return () => {
      delete document.body.dataset["theme"];
    };
  }, [theme]);

  useEffect(() => {
    if (skin) document.body.classList.add(SKIN_CLASS);
    else document.body.classList.remove(SKIN_CLASS);
    return () => {
      document.body.classList.remove(SKIN_CLASS);
    };
  }, [skin]);

  const handleDiagramSwitch = (type: DiagramType): void => {
    setDiagramType(type);
    setDoc(SAMPLES[type]);
  };

  return (
    <div className="uml-playground">
      <header className="uml-playground__topbar">
        <div className="uml-playground__brand">
          <div className="uml-playground__brand-glyph" aria-hidden="true">
            ◉
          </div>
          <div className="uml-playground__brand-name">
            uml-drawer<span>·js</span>
          </div>
          <div className="uml-playground__brand-tag">PLAYGROUND</div>
        </div>
        <nav className="uml-playground__breadcrumb" aria-label="Diagram type">
          {DIAGRAM_TYPES.map((type, idx) => (
            <span key={type}>
              {idx > 0 && <span className="uml-playground__breadcrumb-sep"> · </span>}
              <button
                type="button"
                className="uml-playground__breadcrumb-button"
                onClick={(): void => handleDiagramSwitch(type)}
              >
                {type === diagramType ? (
                  <b>{DIAGRAM_TYPE_LABELS[type]}</b>
                ) : (
                  DIAGRAM_TYPE_LABELS[type]
                )}
              </button>
            </span>
          ))}
          <span className="uml-playground__live">
            <span className="uml-playground__live-dot" aria-hidden="true" />
            LIVE
          </span>
        </nav>
        <div className="uml-playground__topbar-actions">
          <div className="uml-playground__theme-switch" role="group" aria-label="Theme">
            <button
              type="button"
              className="uml-playground__theme-button"
              aria-pressed={theme === "dark"}
              onClick={(): void => setTheme("dark")}
            >
              Dark
            </button>
            <button
              type="button"
              className="uml-playground__theme-button"
              aria-pressed={theme === "light"}
              onClick={(): void => setTheme("light")}
            >
              Light
            </button>
            <button
              type="button"
              className="uml-playground__theme-button"
              aria-pressed={!skin}
              onClick={(): void => setSkin((prev) => !prev)}
              title="Toggle showcase skin (design-agnostic smoke check)"
            >
              {skin ? "Skin" : "Bare"}
            </button>
          </div>
          <button type="button" className="uml-playground__cta">
            Export
          </button>
        </div>
      </header>

      <div className="uml-playground__editor-wrap">
        <UmlEditor
          key={diagramType}
          diagramType={diagramType}
          value={doc}
          theme={theme}
          onChange={(event): void => setDoc(event.text)}
        >
          <div className="uml-playground__anchors">
            <Palette title="Palette" />
            <Outline title="Outline" />
          </div>

          <Canvas data-testid="playground-canvas">
            <HUD
              tl={<HudTopLeft />}
              tr={<HudTopRight />}
              bl={<HudBottomLeft />}
              br={<HudBottomRight />}
            />
            <CanvasToolbar />
          </Canvas>

          <div className="uml-playground__rightcol">
            <PropsPanel title="Properties" />
            <CommandChannel
              title="Command Channel"
              commands={PLAYGROUND_COMMANDS}
              placeholder="/add-class Foo · /connect Foo Bar association · /rename Foo Bar"
            />
          </div>

          <TextEditor title="PlantUML" />
          <Statusbar
            label="UML-DRAWER"
            trailing={<span className="uml-playground__build-tag">BUILD · 0.0.0</span>}
          />
        </UmlEditor>
      </div>
    </div>
  );
}
