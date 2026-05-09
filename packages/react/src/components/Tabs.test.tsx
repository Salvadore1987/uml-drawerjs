import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Tabs } from "./Tabs.js";

afterEach(() => {
  document.body.innerHTML = "";
});

const TABS = [
  { id: "designer", label: "Designer", content: <div data-testid="panel-designer">D</div> },
  { id: "plantuml", label: "PlantUML", content: <div data-testid="panel-plantuml">P</div> },
];

describe("<Tabs />", () => {
  it("renders the first tab as active by default and only its panel is visible", () => {
    // Arrange & Act
    render(<Tabs tabs={TABS} aria-label="View" />);

    // Assert
    const designerTab = screen.getByRole("tab", { name: "Designer" });
    const plantumlTab = screen.getByRole("tab", { name: "PlantUML" });
    expect(designerTab.getAttribute("aria-selected")).toBe("true");
    expect(plantumlTab.getAttribute("aria-selected")).toBe("false");
    // Without keepMounted only the active panel is in the DOM.
    expect(screen.queryByTestId("panel-designer")).not.toBeNull();
    expect(screen.queryByTestId("panel-plantuml")).toBeNull();
  });

  it("activates the second tab on click and toggles `hidden` when keepMounted", () => {
    // Arrange
    render(<Tabs tabs={TABS} keepMounted aria-label="View" />);
    const designerPanel = screen.getByTestId("panel-designer").closest("[role='tabpanel']");
    const plantumlPanel = screen.getByTestId("panel-plantuml").closest("[role='tabpanel']");
    expect(designerPanel?.hasAttribute("hidden")).toBe(false);
    expect(plantumlPanel?.hasAttribute("hidden")).toBe(true);

    // Act
    fireEvent.click(screen.getByRole("tab", { name: "PlantUML" }));

    // Assert
    expect(screen.getByRole("tab", { name: "PlantUML" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(designerPanel?.hasAttribute("hidden")).toBe(true);
    expect(plantumlPanel?.hasAttribute("hidden")).toBe(false);
  });

  it("auto-activates tabs on ArrowRight / ArrowLeft (Radix-style)", () => {
    // Arrange
    render(<Tabs tabs={TABS} keepMounted aria-label="View" />);
    const designerTab = screen.getByRole("tab", { name: "Designer" });

    // Act — focus & arrow-right
    designerTab.focus();
    fireEvent.keyDown(designerTab, { key: "ArrowRight" });

    // Assert — active migrated, focus follows
    expect(screen.getByRole("tab", { name: "PlantUML" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "PlantUML" }));

    // Act — arrow-right wraps back to first
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowRight" });
    expect(designerTab.getAttribute("aria-selected")).toBe("true");
  });

  it("Home / End jump to the first / last enabled tab", () => {
    // Arrange
    const threeTabs = [
      ...TABS,
      { id: "ast", label: "AST", content: <div data-testid="panel-ast">A</div> },
    ];
    render(<Tabs tabs={threeTabs} keepMounted aria-label="View" />);
    const designerTab = screen.getByRole("tab", { name: "Designer" });
    designerTab.focus();

    // Act + Assert — End
    fireEvent.keyDown(designerTab, { key: "End" });
    expect(screen.getByRole("tab", { name: "AST" }).getAttribute("aria-selected")).toBe("true");

    // Act + Assert — Home
    fireEvent.keyDown(document.activeElement as Element, { key: "Home" });
    expect(designerTab.getAttribute("aria-selected")).toBe("true");
  });

  it("invokes onChange and respects controlled `value`", () => {
    // Arrange
    const onChange = vi.fn();
    function Controlled(): JSX.Element {
      const [value, setValue] = useState<string>("designer");
      return (
        <Tabs
          tabs={TABS}
          value={value}
          onChange={(id) => {
            onChange(id);
            setValue(id);
          }}
          keepMounted
          aria-label="View"
        />
      );
    }
    render(<Controlled />);

    // Act
    act(() => {
      fireEvent.click(screen.getByRole("tab", { name: "PlantUML" }));
    });

    // Assert
    expect(onChange).toHaveBeenCalledWith("plantuml");
    expect(screen.getByRole("tab", { name: "PlantUML" }).getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  it("skips disabled tabs during keyboard navigation", () => {
    // Arrange
    const tabsWithDisabled = [
      TABS[0]!,
      { id: "mid", label: "Mid", content: <div>M</div>, disabled: true },
      TABS[1]!,
    ];
    render(<Tabs tabs={tabsWithDisabled} keepMounted aria-label="View" />);
    const first = screen.getByRole("tab", { name: "Designer" });
    first.focus();

    // Act
    fireEvent.keyDown(first, { key: "ArrowRight" });

    // Assert — landed on PlantUML, not the disabled "Mid" tab
    expect(screen.getByRole("tab", { name: "PlantUML" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "PlantUML" }));
  });

  it("applies the position modifier class for top-tabs", () => {
    // Arrange & Act
    const { container } = render(<Tabs tabs={TABS} tabsPosition="top" aria-label="View" />);

    // Assert
    expect(container.querySelector(".uml-tabs--position-top")).not.toBeNull();
    expect(container.querySelector(".uml-tabs--position-bottom")).toBeNull();
  });
});
