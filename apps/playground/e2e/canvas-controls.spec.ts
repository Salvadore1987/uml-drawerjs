import { test, expect } from "@playwright/test";

/**
 * Diagnostic E2E. Opens the playground and exercises the canvas
 * toolbar to verify zoom / fit / lock actually work — not just render.
 * Saves screenshots before/after each interaction so a human can
 * eyeball what went wrong if an assertion fails.
 */

test.describe("Canvas controls — interactive diagnosis", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for canvas + auto-layout to settle.
    await page.waitForSelector(".uml-canvas-host svg");
    await page.waitForTimeout(800);
  });

  test("toolbar renders all controls", async ({ page }) => {
    const toolbar = page.locator(".uml-canvas-toolbar");
    await expect(toolbar).toBeVisible();
    await expect(toolbar.getByRole("button", { name: "Zoom out" })).toBeVisible();
    await expect(toolbar.getByRole("button", { name: "Zoom in" })).toBeVisible();
    await expect(toolbar.getByRole("button", { name: "Fit to view" })).toBeVisible();
    await expect(toolbar.locator(".uml-canvas-toolbar__readout")).toBeVisible();
    await page.screenshot({
      path: "apps/playground/e2e/screenshots/01-initial.png",
      fullPage: true,
    });
  });

  test("zoom in button changes the transform on the content group", async ({ page }) => {
    const contentGroup = page.locator('[data-uml-content="true"]').first();
    const before = await contentGroup.getAttribute("transform");

    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.waitForTimeout(200);

    const after = await contentGroup.getAttribute("transform");
    await page.screenshot({
      path: "apps/playground/e2e/screenshots/02-after-zoom-in.png",
      fullPage: true,
    });

    expect(before).not.toBe(after);
    expect(after).toMatch(/scale\(/);
  });

  test("readout updates after zoomIn", async ({ page }) => {
    const readout = page.locator(".uml-canvas-toolbar__readout");
    const before = await readout.textContent();

    await page.getByRole("button", { name: "Zoom in" }).click({ force: true });
    await page.waitForTimeout(150);

    const after = await readout.textContent();
    expect(after).not.toBe(before);
    expect(after).toMatch(/^\d+%$/);
  });

  test("fit-to-view button writes a transform with non-1 scale on a small viewport diagram", async ({
    page,
  }) => {
    const contentGroup = page.locator('[data-uml-content="true"]').first();

    await page.getByRole("button", { name: "Fit to view" }).click();
    await page.waitForTimeout(200);

    const transform = await contentGroup.getAttribute("transform");
    await page.screenshot({
      path: "apps/playground/e2e/screenshots/03-after-fit.png",
      fullPage: true,
    });

    expect(transform).toMatch(/translate\([^)]+\) scale\(/);
  });

  test("lock toggle adds data-locked and disables click-to-select", async ({ page }) => {
    const lockButton = page.getByRole("button", { name: /^(Lock|Unlock) canvas$/ });
    const host = page.locator(".uml-canvas-host");

    await lockButton.click();
    await page.waitForTimeout(150);

    await expect(host).toHaveAttribute("data-locked", "true");

    // Click via DOM dispatch on a node element to avoid Playwright's
    // pointer hit-test colliding with the HUD overlay corners.
    const dispatchNodeClick = async (): Promise<void> => {
      await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll("[data-node-id]"));
        const node = nodes[nodes.length - 1] as Element | undefined;
        if (!node) return;
        const rect = node.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        for (const type of ["pointerdown", "pointerup", "click"]) {
          node.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              clientX: cx,
              clientY: cy,
              pointerId: 1,
              pointerType: "mouse",
            }),
          );
        }
      });
    };

    await dispatchNodeClick();
    await page.waitForTimeout(150);
    expect(await page.locator('[data-selected="true"]').count()).toBe(0);

    await page.screenshot({
      path: "apps/playground/e2e/screenshots/04-locked.png",
      fullPage: true,
    });

    // Unlock and click again — selection should appear.
    await lockButton.click();
    await page.waitForTimeout(150);
    await expect(host).not.toHaveAttribute("data-locked", "true");

    await dispatchNodeClick();
    await page.waitForTimeout(200);
    expect(await page.locator('[data-selected="true"]').count()).toBe(1);
  });

  test("Shift+drag on empty canvas creates marquee and selects intersecting nodes", async ({
    page,
  }) => {
    // Drag a marquee from the centre of canvas via DOM-dispatched
    // pointer events (avoids HUD/toolbar overlay interference).
    const result = await page.evaluate(() => {
      const host = document.querySelector(".uml-canvas-host");
      const svg = host?.querySelector("svg");
      if (!host || !svg) return { ok: false, count: 0, marqueeFound: false };
      const rect = host.getBoundingClientRect();
      const startX = rect.left + 20;
      const startY = rect.top + 20;
      const endX = rect.right - 20;
      const endY = rect.bottom - 20;
      const fire = (type: string, x: number, y: number, shift = false): void => {
        svg.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            shiftKey: shift,
            pointerId: 1,
            pointerType: "mouse",
          }),
        );
      };
      fire("pointerdown", startX, startY, true);
      const marqueeMid = !!document.querySelector(".uml-marquee");
      fire("pointermove", endX, endY, true);
      fire("pointerup", endX, endY, true);
      const count = document.querySelectorAll('[data-selected="true"]').length;
      const marqueeAfter = document.querySelector(".uml-marquee");
      return { ok: true, count, marqueeFound: marqueeMid, leftover: !!marqueeAfter };
    });

    await page.screenshot({
      path: "apps/playground/e2e/screenshots/06-marquee.png",
      fullPage: true,
    });

    expect(result.ok).toBe(true);
    expect(result.marqueeFound).toBe(true);
    expect(result.count).toBeGreaterThan(0);
    expect(result.leftover).toBe(false);
  });

  test("group drag moves all selected nodes; one Cmd+Z reverts whole group", async ({ page }) => {
    // First pre-select two nodes via marquee, then drag one of them.
    const setup = await page.evaluate(() => {
      const host = document.querySelector(".uml-canvas-host");
      const svg = host?.querySelector("svg");
      if (!host || !svg) return { ok: false };
      const rect = host.getBoundingClientRect();
      const fire = (type: string, x: number, y: number, shift = false): void => {
        svg.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            shiftKey: shift,
            pointerId: 1,
            pointerType: "mouse",
          }),
        );
      };
      fire("pointerdown", rect.left + 20, rect.top + 20, true);
      fire("pointermove", rect.right - 20, rect.bottom - 20, true);
      fire("pointerup", rect.right - 20, rect.bottom - 20, true);
      return { ok: true, selected: document.querySelectorAll('[data-selected="true"]').length };
    });
    expect(setup.ok).toBe(true);
    expect(setup.selected ?? 0).toBeGreaterThanOrEqual(2);

    // Capture transforms BEFORE the group drag.
    const beforeTransforms = await page.$$eval("[data-node-id]", (els) =>
      els.map((el) => ({ id: el.getAttribute("data-node-id"), t: el.getAttribute("transform") })),
    );

    // Drag one of the selected nodes.
    const dragInfo = await page.evaluate(() => {
      const selected = document.querySelectorAll('[data-selected="true"]');
      const node = selected[0] as Element | undefined;
      if (!node) return { error: "no selected node found", selectedCount: selected.length };
      const rect = (node as SVGGraphicsElement).getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const svg = document.querySelector(".uml-canvas-host svg");
      if (!svg) return { error: "no svg" };
      const fire = (type: string, x: number, y: number, target: Element): void => {
        target.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            pointerId: 1,
            pointerType: "mouse",
          }),
        );
      };
      fire("pointerdown", cx, cy, node);
      // Inspect node transform mid-drag — should be updated by onPointerMove.
      fire("pointermove", cx + 80, cy + 60, svg);
      const midDragTransform = node.getAttribute("transform");
      fire("pointerup", cx + 80, cy + 60, svg);
      return {
        selectedCount: selected.length,
        nodeId: node.getAttribute("data-node-id"),
        startCenter: { cx, cy },
        midDragTransform,
        afterUpTransform: node.getAttribute("transform"),
      };
    });
    expect(dragInfo.error).toBeUndefined();
    await page.waitForTimeout(150);
    await page.waitForTimeout(150);

    const afterTransforms = await page.$$eval("[data-node-id]", (els) =>
      els.map((el) => ({ id: el.getAttribute("data-node-id"), t: el.getAttribute("transform") })),
    );

    // At least 2 nodes had their transform change (group move).
    const movedCount = afterTransforms.filter(
      (after, idx) => after.t !== beforeTransforms[idx]?.t,
    ).length;
    expect(movedCount).toBeGreaterThanOrEqual(2);

    await page.screenshot({
      path: "apps/playground/e2e/screenshots/07-after-group-move.png",
      fullPage: true,
    });

    // Trigger undo via the keyboard event channel (Cmd/Ctrl+Z on the host).
    const undoFired = await page.evaluate(() => {
      const host = document.querySelector(".uml-canvas-host") as HTMLElement | null;
      if (!host) return false;
      const evt = new KeyboardEvent("keydown", {
        key: "z",
        code: "KeyZ",
        keyCode: 90,
        metaKey: true,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      const fired = host.dispatchEvent(evt);
      return { fired, defaultPrevented: !fired };
    });
    expect(undoFired).toBeTruthy();
    await page.waitForTimeout(400);

    const undoneTransforms = await page.$$eval("[data-node-id]", (els) =>
      els.map((el) => ({ id: el.getAttribute("data-node-id"), t: el.getAttribute("transform") })),
    );

    // Undone transforms should match the pre-drag state for all nodes.
    expect(undoneTransforms).toEqual(beforeTransforms);

    await page.screenshot({
      path: "apps/playground/e2e/screenshots/08-after-undo-group.png",
      fullPage: true,
    });
  });

  test("grid layer renders inside content group and toggles via toolbar", async ({ page }) => {
    // Initial state — grid layer should be visible (default).
    const gridRect = page.locator('[data-uml-layer="grid"] rect');
    await expect(gridRect).toBeAttached();

    // Toolbar grid button toggles visibility.
    const gridButton = page.getByRole("button", { name: /^(Hide|Show) grid$/ });
    await expect(gridButton).toHaveAttribute("aria-pressed", "true");

    await gridButton.click();
    await page.waitForTimeout(150);
    await expect(gridButton).toHaveAttribute("aria-pressed", "false");
    // Hidden mode keeps the layer slot but drops the rect.
    await expect(page.locator('[data-uml-layer="grid"] rect')).toHaveCount(0);

    await gridButton.click();
    await page.waitForTimeout(150);
    await expect(gridButton).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-uml-layer="grid"] rect')).toBeAttached();
    await page.screenshot({
      path: "apps/playground/e2e/screenshots/09-grid-toggle.png",
      fullPage: true,
    });
  });

  test("resize handles appear when a single node is selected and dispatch ResizeNode on drag", async ({
    page,
  }) => {
    // Select a single node by clicking it.
    const result = await page.evaluate(() => {
      const node = document.querySelector("[data-node-id]") as Element | null;
      if (!node) return { ok: false, count: 0, dispatched: false };
      const rect = (node as SVGGraphicsElement).getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const fire = (type: string, target: Element, x: number, y: number): void => {
        target.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            pointerId: 1,
            pointerType: "mouse",
          }),
        );
      };
      fire("pointerdown", node, cx, cy);
      fire("pointerup", node, cx, cy);
      return {
        ok: true,
        count: document.querySelectorAll('[data-selected="true"]').length,
        nodeId: node.getAttribute("data-node-id"),
      };
    });
    expect(result.ok).toBe(true);
    expect(result.count).toBe(1);

    // After single-select, eight resize handles must be present.
    const handles = page.locator(`[data-node-id="${result.nodeId}"] [data-resize-handle]`);
    await expect(handles).toHaveCount(8);

    // Drag the SE handle to enlarge the node by ~24 px.
    const drag = await page.evaluate((nodeId) => {
      const handle = document.querySelector(
        `[data-node-id="${nodeId}"] [data-resize-handle="se"]`,
      ) as Element | null;
      if (!handle) return { ok: false };
      const r = (handle as SVGGraphicsElement).getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const svg = document.querySelector(".uml-canvas-host svg")!;
      const fire = (type: string, target: Element, x: number, y: number): void => {
        target.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            pointerId: 1,
            pointerType: "mouse",
          }),
        );
      };
      fire("pointerdown", handle, cx, cy);
      fire("pointermove", svg, cx + 30, cy + 20);
      fire("pointerup", svg, cx + 30, cy + 20);
      return { ok: true };
    }, result.nodeId);
    expect(drag.ok).toBe(true);
    await page.waitForTimeout(200);

    // After resize, the node's frame rect should have grown by a
    // multiple of the grid step (24). Snap is applied to the *delta* —
    // the same rule as move-drag — so the absolute width is `original
    // + N×step`. Asserting the delta-mod proves snap fired without
    // depending on the original (default) width staying at 200 forever.
    const frameWidth = await page.evaluate((nodeId) => {
      const node = document.querySelector(`[data-node-id="${nodeId}"]`);
      if (!node) return null;
      const rects = Array.from(node.querySelectorAll("rect")).filter(
        (r) => !r.hasAttribute("data-resize-handle"),
      );
      const widths = rects.map((r) => Number(r.getAttribute("width") ?? 0));
      return widths.length > 0 ? Math.max(...widths) : null;
    }, result.nodeId);
    expect(frameWidth).not.toBeNull();
    // The default width is 200; after a +30 px drag snapped to step 24,
    // the new width is 224. Both 200 and 224 are valid (in case the
    // playground default changes), so we check growth + delta-mod.
    expect(frameWidth!).toBeGreaterThan(200);
    expect((frameWidth! - 200) % 24).toBe(0);

    await page.screenshot({
      path: "apps/playground/e2e/screenshots/10-after-resize.png",
      fullPage: true,
    });
  });

  test("pan: dragging on the canvas background changes the transform", async ({ page }) => {
    const host = page.locator(".uml-canvas-host");
    const contentGroup = page.locator('[data-uml-content="true"]').first();

    const before = await contentGroup.getAttribute("transform");
    const box = await host.boundingBox();
    if (!box) throw new Error("canvas host has no bounding box");

    // Drag from the bottom-left corner (least likely to be over a node)
    // toward the centre — this should pan the content.
    const startX = box.x + 30;
    const startY = box.y + box.height - 30;
    const endX = box.x + box.width / 2;
    const endY = box.y + box.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(150);

    const after = await contentGroup.getAttribute("transform");
    await page.screenshot({
      path: "apps/playground/e2e/screenshots/05-after-pan.png",
      fullPage: true,
    });

    expect(before).not.toBe(after);
  });
});
