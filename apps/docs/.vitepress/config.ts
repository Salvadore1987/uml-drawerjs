import { defineConfig } from "vitepress";

// `BASE_PATH` is supplied by the deploy workflow so the docs can live
// under `/uml-drawerjs/` on GitHub Pages alongside the playground at
// `/uml-drawerjs/playground/`. Local `pnpm dev` defaults to `/`.
const base = process.env["BASE_PATH"] ?? "/";

export default defineConfig({
  base,
  title: "UML Drawer JS",
  description:
    "Framework-agnostic TypeScript library for editing UML diagrams with bidirectional PlantUML sync.",
  lastUpdated: true,
  cleanUrls: true,
  // The /playground/ subtree is built separately by `apps/playground` and
  // mounted alongside the docs at deploy time. Skip dead-link checking
  // for those URLs so docs builds don't require the playground to exist.
  ignoreDeadLinks: [/^\/playground\//u],
  themeConfig: {
    siteTitle: "UML Drawer JS",
    nav: [
      { text: "Guide", link: "/getting-started" },
      { text: "Concepts", link: "/concepts/ast" },
      { text: "Diagrams", link: "/diagrams/class" },
      { text: "Theming", link: "/theming" },
      { text: "API", link: "/api/" },
      { text: "Recipes", link: "/recipes/" },
      { text: "Migration", link: "/migration" },
      { text: "Playground", link: "/playground/", target: "_self" },
    ],
    sidebar: {
      "/": [
        {
          text: "Introduction",
          collapsed: false,
          items: [
            { text: "Overview", link: "/" },
            { text: "Getting Started", link: "/getting-started" },
            { text: "Theming", link: "/theming" },
            { text: "Migration", link: "/migration" },
          ],
        },
        {
          text: "Concepts",
          collapsed: false,
          items: [
            { text: "AST as the source of truth", link: "/concepts/ast" },
            { text: "Bidirectional sync", link: "/concepts/sync" },
            { text: "CQRS commands & history", link: "/concepts/commands" },
            { text: "Validators & quick-fixes", link: "/concepts/validators" },
            { text: "Renderer & layout", link: "/concepts/renderer" },
          ],
        },
        {
          text: "Diagrams",
          collapsed: false,
          items: [
            { text: "Class", link: "/diagrams/class" },
            { text: "C4 Context", link: "/diagrams/c4-context" },
            { text: "C4 Container", link: "/diagrams/c4-container" },
            { text: "C4 Component", link: "/diagrams/c4-component" },
            { text: "Entity Relationship", link: "/diagrams/er" },
            { text: "Sequence", link: "/diagrams/sequence" },
          ],
        },
        {
          text: "Recipes",
          collapsed: false,
          items: [
            { text: "Embedding the editor", link: "/recipes/" },
            { text: "Custom skins", link: "/recipes/skins" },
            { text: "CodeMirror integration", link: "/recipes/codemirror" },
            { text: "Headless API usage", link: "/recipes/headless" },
          ],
        },
        {
          text: "API Reference",
          collapsed: true,
          items: [
            { text: "Overview", link: "/api/" },
            { text: "@uml-drawer/core", link: "/api/core" },
            { text: "@uml-drawer/react", link: "/api/react" },
            { text: "@uml-drawer/codemirror-plantuml", link: "/api/codemirror" },
            { text: "@uml-drawer/theme", link: "/api/theme" },
          ],
        },
      ],
    },
    socialLinks: [{ icon: "github", link: "https://github.com/Salvadore1987/uml-drawerjs" }],
    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © 2026 UML Drawer JS contributors",
    },
    search: {
      provider: "local",
    },
  },
});
