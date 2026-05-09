# ADR-0005 — Drill-down (sub-diagrams) is out of scope for MVP

- **Status:** Accepted
- **Date:** 2026-05-09
- **Authors:** UML Drawer JS contributors
- **Phase:** Cross-cutting (applies to C4 and Class diagrams)

## Context

The C4 model is naturally hierarchical: a Container in a Context diagram corresponds to its own Container-level diagram; a Component in a Container diagram corresponds to its own Component-level diagram. A "drill-down" UX would let the user double-click a Container node and switch into the Container-level diagram for that system.

Class diagrams have a similar hierarchical idea — a class member could expand into a state machine or sub-diagram.

This is high-value but adds significant complexity:

- The AST shape is currently single-rooted. Drill-down implies a forest (or a single root with embedded sub-diagrams).
- The text representation has no canonical PlantUML syntax for "this Container expands into this other diagram". A meta-comment scheme would have to be invented and round-tripped.
- The renderer currently sizes one diagram to the canvas. Drill-down implies stack/breadcrumb navigation through multiple diagrams without losing scroll/selection state.
- Validators, exporters, and the React adapter all assume a single `Diagram` per editor instance.

## Decision

**Drill-down is out of scope for the 0.x line.** The MVP supports each diagram type as an independent root document; users compose multi-level systems by maintaining sibling files (`context.puml`, `container.puml`, `component.puml`, …) and switching between them through the host application.

Rationale:

- The MVP delivers more value by ensuring single-diagram editing is excellent than by partially shipping drill-down.
- The PlantUML community itself does not have a single canonical drill-down syntax; locking in a meta-comment scheme prematurely would create migration debt later.
- The architecture is amenable to drill-down once we choose to land it — the AST is already metadata-aware, the editor is already host-mounted, and the React adapter could host a stack of editors with shared theme/skin.

## Consequences

### Pros

- The MVP stays focused; the hexagonal seams stay clean.
- Hosts that need drill-down today implement it as N siblings (which is what most existing PlantUML tooling expects).

### Cons

- Users coming from interactive C4 tools (Structurizr, IcePanel) will notice the gap.
- We do not yet have a meta-comment vocabulary for "this Container expands into that diagram"; that needs design work before drill-down lands.

### Followups

- Capture the drill-down design as a separate ADR (`0007-drilldown-design.md`) when we revisit it. Topics to cover: AST shape (forest vs. embedded), URL/breadcrumb navigation, lazy-loading of sub-diagrams, persistence format, validator scope.
- Consider a `drill-down` event API on the editor instance so hosts can wire their own routing without core support.
