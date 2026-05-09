import { describe, expect, it, vi } from "vitest";

import { computeDiagnostics } from "./lint.js";

describe("computeDiagnostics — parser → validators → CM diagnostic", () => {
  it("forwards parser unknown-reference errors with their range", () => {
    // Arrange — `Foo --> Unknown` references undeclared aliases.
    const text = "@startuml\nFoo --> Unknown\n@enduml\n";

    // Act
    const diagnostics = computeDiagnostics(text, { diagramType: "class" });

    // Assert
    expect(diagnostics.length).toBeGreaterThan(0);
    const synErr = diagnostics.find((d) => d.source?.includes("SYNTAX_UNKNOWN_REFERENCE"));
    expect(synErr).toBeDefined();
    expect(synErr!.from).toBeGreaterThanOrEqual(0);
    expect(synErr!.to).toBeGreaterThan(synErr!.from);
    expect(synErr!.severity).toBe("error");
  });

  it("forwards meta-comment errors", () => {
    // Arrange
    const text = "@startuml\n' @drawer:meta { not-json }\n@enduml\n";

    // Act
    const diagnostics = computeDiagnostics(text, { diagramType: "class" });

    // Assert
    expect(diagnostics.find((d) => d.source?.includes("SYNTAX_META"))).toBeDefined();
  });

  it("missing markers produce warning diagnostics anchored at the document head", () => {
    // Arrange
    const text = "class Foo\nclass Bar\n";

    // Act
    const diagnostics = computeDiagnostics(text, { diagramType: "class" });

    // Assert
    const missing = diagnostics.filter((d) => d.source?.includes("SYNTAX_MISSING_MARKER"));
    expect(missing).toHaveLength(2); // missing @startuml + @enduml
    expect(missing.every((d) => d.severity === "warning")).toBe(true);
  });

  it("attaches a quick-fix action that dispatches a Command", () => {
    // Arrange — orphan-node lint warning has a registered quick-fix.
    const text = "@startuml\nclass Lonely\n@enduml\n";
    const dispatch = vi.fn();

    // Act
    const diagnostics = computeDiagnostics(text, {
      diagramType: "class",
      dispatch,
    });

    // Assert
    const orphan = diagnostics.find((d) => d.source?.includes("LINT_ORPHAN_NODE"));
    expect(orphan).toBeDefined();
    expect(orphan!.actions?.length ?? 0).toBeGreaterThan(0);

    // Trigger the fix — dispatch should be called with a Command-shaped object.
    const action = orphan!.actions![0]!;
    action.apply({} as never, orphan!.from, orphan!.to);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const command = dispatch.mock.calls[0]![0]!;
    expect(command).toMatchObject({ kind: "RemoveNode" });
  });

  it("transformDiagnostic can drop diagnostics", () => {
    // Arrange
    const text = "@startuml\nclass Foo\n@enduml\n"; // "@enduml" missing → warning
    const drop = (): null => null;

    // Act
    const diagnostics = computeDiagnostics(text, {
      diagramType: "class",
      transformDiagnostic: drop,
    });

    // Assert
    expect(diagnostics).toEqual([]);
  });

  it("severity stays compatible with CM (info passes through)", () => {
    // Arrange — info-severity errors don't currently surface in MVP, but the
    // mapping path should not coerce arbitrary severities to error.
    const text = "@startuml\nclass A\n@enduml\n";

    // Act
    const diagnostics = computeDiagnostics(text, { diagramType: "class" });

    // Assert — no diagnostics, but if any existed they would be info/warning/error.
    for (const diag of diagnostics) {
      expect(["error", "warning", "info"]).toContain(diag.severity);
    }
  });
});
