# Interaction matrix — touch / mobile UX

A reference table mapping every editor interaction to the input modalities it must support. Hover-only behaviours are explicitly forbidden; every action exposes at least one keyboard, touch, and pointer path.

## Principles

1. **Hover is decorative, never load-bearing.** Anything reachable on hover must also be reachable via click/tap, focus, or a slash command.
2. **Every action has a keyboard path.** Tab/Shift-Tab + Arrow + Enter + Delete + Cmd/Ctrl + standard text editing keys cover the canvas, palette, props panel, and outline.
3. **Touch parity by design.** A touch user with no keyboard and no hover must be able to complete the golden paths (add node, connect nodes, edit label, undo/redo, switch theme, switch diagram type, export).
4. **No drag-only actions.** Anything draggable also has a discrete equivalent (palette buttons add at canvas centre; arrow keys nudge; outline click selects).
5. **Targets ≥ 44×44 CSS pixels** on the playground UI, per WCAG. Library components inherit through the size tokens.

## Interaction matrix

| Action                              | Mouse / pointer            | Touch                         | Keyboard                                          | Slash command (playground) |
| ----------------------------------- | -------------------------- | ----------------------------- | ------------------------------------------------- | -------------------------- |
| **Add node**                        | Click palette button       | Tap palette button            | Tab to palette, Enter on item                     | `/add-class Foo`           |
| **Connect two nodes**               | Click source, click target¹| Tap source, tap target¹       | Tab to source, Space, Tab to target, Space        | `/connect Foo Bar`         |
| **Move node**                       | Drag                       | Touch-drag                    | Select node, Arrow keys (Shift = ×10)              | n/a                        |
| **Resize / pan canvas**             | Wheel + drag               | Pinch-zoom + drag             | `+ / -` for zoom, Arrow keys for pan² (planned)   | n/a                        |
| **Edit label**                      | Double-click node³         | Double-tap node³              | Select, Enter to focus props panel                | `/rename Foo Baz`          |
| **Group selection**                 | Drag-select, then Group    | Touch-drag select, Group btn  | Multi-select via Shift-Tab + Space, Group        | `/group Boundary id1 id2`  |
| **Ungroup**                         | Click group, Ungroup btn   | Tap group, Ungroup btn        | Select, Backspace                                  | `/ungroup boundary-1`      |
| **Undo**                            | Toolbar button             | Toolbar button                | Cmd/Ctrl + Z                                       | n/a                        |
| **Redo**                            | Toolbar button             | Toolbar button                | Cmd/Ctrl + Shift + Z                              | n/a                        |
| **Switch diagram type**             | Breadcrumb click           | Breadcrumb tap                | Tab to breadcrumb, Enter                          | n/a                        |
| **Switch theme (dark/light)**       | Theme switch click         | Theme switch tap              | Tab to switch, Space                              | n/a                        |
| **Toggle skin (debug)**             | "Bare" button              | "Bare" button                 | Tab, Enter                                         | n/a                        |
| **Export SVG / PNG / PUML**         | Export menu                | Export menu                   | Tab to menu, Enter, Arrow keys                    | n/a                        |
| **Open / save file**                | File menu                  | File menu                     | Cmd/Ctrl + O / S (delegated to host)              | n/a                        |

¹ Connection mode is entered via a palette button or `/connect`. Selecting two nodes in connection mode dispatches `addEdgeCommand`.
² Keyboard pan/zoom are tracked as a follow-up — the `attachKeyboardNavigation` adapter already routes arrow keys, so wiring `+ / -` to `panZoom.setState` is straightforward.
³ Double-click edits the AST label inline (planned for post-MVP); until then, the props-panel form is the primary edit path and double-click focuses the props panel.

## Reduced motion

Every animation in the playground (live-pill pulse, theme transition, glow pulses inside the cyber-topographic skin) is gated through `@media (prefers-reduced-motion: reduce)`. The library itself ships zero animations, so reduced-motion hosts see exactly the same renderer output.

## Status

This matrix is the **specification**. The MVP achieves it for the rows above the dashed line; rows requiring multi-select, file menu, or keyboard pan/zoom land in follow-up work. Each gap is tracked as a Phase 14b/15 ticket.
