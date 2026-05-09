# ADR-0006 — AI assistant: separate extension package, not core

- **Status:** Accepted
- **Date:** 2026-05-09
- **Authors:** UML Drawer JS contributors
- **Phase:** Cross-cutting (governs how AI features land post-MVP)

## Context

The spec mentions an AI-assistant feature (natural-language → diagram, refactoring suggestions, lint-with-explanations). This is a high-value capability but introduces concerns the MVP shouldn't carry:

- Network calls to an LLM provider — credential handling, opt-in semantics, regional/data-sovereignty issues.
- Streaming UI patterns that don't fit the rest of the editor's synchronous shell.
- Provider lock-in if the wrong abstraction is chosen.
- Large dependency surface (provider SDKs are heavy and version-volatile).

The architecture is already amenable to AI features without baking any of this into the core: every state change is a serialisable command, the AST is JSON-schema-typed, validators emit structured errors with stable codes, and the editor instance exposes both `dispatch` and `bus.on("after")`.

## Decision

AI features ship as a **separate extension package** (`@uml-drawer/ai` or similar), built on top of the existing public API:

```
@uml-drawer/ai
  ├── adapters/   # provider-specific shims (OpenAI, Anthropic, …)
  ├── prompts/    # tools for natural-language → command sequences
  ├── lint/       # AI explanations layered on top of validator output
  └── index.ts    # public hooks (useAIPlanner, etc.)
```

The AI package consumes:

- `editor.getState()` to capture context.
- `editor.dispatch(command)` to apply changes.
- `bus.on("after")` to react to user edits (e.g. update a streaming suggestion).
- `runAllValidators` output to build "explain this error" prompts.

The MVP packages stay AI-free. The 500 KB bundle budget covers the visible editor; AI is opt-in for hosts that want it.

## Consequences

### Pros

- Network code, provider SDKs, and credential prompts live in a separate package — easy to audit, easy to omit.
- The AI extension can move at its own velocity (provider APIs change frequently); the editor packages stay stable.
- The same extension surface scales to non-LLM smart features (heuristic-based "suggested edges", validator-driven "fix it for me") with no new architecture.

### Cons

- Hosts integrating AI need to install one more package and wire it manually. The README + a recipe will demonstrate the pattern.
- We pay a one-time design cost when the AI package starts: choose the prompt-to-command mapping, decide on streaming vs. discrete suggestions, etc.

### Followups

- When the AI extension lands, write `0008-ai-extension-architecture.md` with the chosen prompt → command translation strategy, token-budget approach, and provider-adapter abstraction.
- Consider a thin `@uml-drawer/ai-types` package that captures the shared interfaces (e.g. `AIProvider`, `Suggestion`) so hosts can swap providers without recompiling.
