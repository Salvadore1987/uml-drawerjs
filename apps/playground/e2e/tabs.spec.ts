import { test, expect } from "@playwright/test";

/**
 * Workspace tabs E2E. Confirms the unified work area toggles between
 * the Designer (canvas + HUD + toolbar) and the PlantUML textarea via
 * the bottom-of-zone tablist, and that the canvas keeps its pan/zoom
 * state across switches (the whole point of `keepMounted`).
 */

test.describe("Workspace tabs — Designer / PlantUML", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".uml-canvas-host svg");
    await page.waitForTimeout(800);
  });

  test("Designer is active by default and PlantUML panel is hidden", async ({ page }) => {
    const designerTab = page.getByRole("tab", { name: "Designer" });
    const plantumlTab = page.getByRole("tab", { name: "PlantUML" });
    await expect(designerTab).toHaveAttribute("aria-selected", "true");
    await expect(plantumlTab).toHaveAttribute("aria-selected", "false");

    const designerPanel = page.locator('[data-uml-panel="designer"]');
    const plantumlPanel = page.locator('[data-uml-panel="plantuml"]');
    await expect(designerPanel).toBeVisible();
    // Hidden via the `hidden` attribute -> Playwright treats as not visible.
    await expect(plantumlPanel).toBeHidden();
    await expect(page.locator(".uml-canvas-toolbar")).toBeVisible();
  });

  test("clicking PlantUML reveals the textarea and hides the canvas", async ({ page }) => {
    await page.getByRole("tab", { name: "PlantUML" }).click();

    await expect(page.getByRole("tab", { name: "PlantUML" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.locator('[data-uml-panel="plantuml"]')).toBeVisible();
    await expect(page.locator('[data-uml-panel="designer"]')).toBeHidden();
    await expect(page.locator(".uml-text-editor__textarea")).toBeVisible();
    // Canvas-overlay toolbar lives inside the Designer panel and must
    // disappear together with it.
    await expect(page.locator(".uml-canvas-toolbar")).toBeHidden();
  });

  test("Alt+2 switches to PlantUML and Alt+1 switches back to Designer", async ({ page }) => {
    await page.keyboard.press("Alt+2");
    await expect(page.getByRole("tab", { name: "PlantUML" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await page.keyboard.press("Alt+1");
    await expect(page.getByRole("tab", { name: "Designer" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("canvas pan-state survives a tab switch", async ({ page }) => {
    const contentGroup = page.locator('[data-uml-content="true"]').first();

    // Move pan via zoom-in (deterministic; pure pointer-drag is brittle
    // because pan-zoom suppresses drag-on-button events).
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.waitForTimeout(150);
    const transformAfterZoom = await contentGroup.getAttribute("transform");
    expect(transformAfterZoom).toMatch(/scale\(/);

    // Switch to PlantUML and back.
    await page.getByRole("tab", { name: "PlantUML" }).click();
    await expect(page.locator('[data-uml-panel="designer"]')).toBeHidden();
    await page.getByRole("tab", { name: "Designer" }).click();
    await expect(page.locator('[data-uml-panel="designer"]')).toBeVisible();

    // Transform on the (still-mounted) content group is preserved —
    // the editor instance was never destroyed.
    const transformAfterReturn = await contentGroup.getAttribute("transform");
    expect(transformAfterReturn).toBe(transformAfterZoom);
  });
});
