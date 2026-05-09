---
layout: home

hero:
  name: UML Drawer JS
  text: Edit UML diagrams with bidirectional PlantUML sync.
  tagline: Framework-agnostic TypeScript core, idiomatic React adapter, design-agnostic theming contract — visual edits and text edits converge on a single AST.
  image:
    src: /hero-glyph.svg
    alt: UML Drawer JS
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: Open the Playground
      link: /playground/
    - theme: alt
      text: GitHub
      link: https://github.com/Salvadore1987/uml-drawerjs

features:
  - title: AST as the source of truth
    details: A single Diagram tree underlies both the canvas and the PlantUML text. Every mutation flows through CQRS commands, so undo / redo and a future CRDT layer are free.
    link: /concepts/ast
  - title: Five diagram types
    details: C4 Context / Container / Component, Class, Entity-Relationship, Sequence — with per-type validators and a tuned renderer.
    link: /diagrams/class
  - title: Design-agnostic by contract
    details: The library only references --uml-* CSS custom properties. Skin authors override the contract from a single class scope.
    link: /theming
  - title: Lazy-loaded heavy work
    details: ELK auto-layout is dynamically imported on first use; the core barrel without ELK stays under 30 KB brotli.
    link: /concepts/renderer
  - title: Tree-shakeable ESM
    details: Every package is sideEffects-clean (with the obvious exception of theme CSS) and ships .d.ts declarations.
  - title: Hexagonal core
    details: Parser / generator / validators / layout / renderer / commands / history / exporters are isolated behind tiny modules — easy to swap, easy to test.
---
