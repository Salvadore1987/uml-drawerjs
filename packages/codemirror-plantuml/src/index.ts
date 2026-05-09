/**
 * `@uml-drawer/codemirror-plantuml` — CodeMirror 6 language support for
 * the PlantUML subset documented in `docs/adr/0003-plantuml-subset.md`.
 *
 * Re-exports four primitives:
 *   - `plantUml()` / `plantUmlLanguage` (highlighting via StreamLanguage)
 *   - `plantUmlLint()` (diagnostics + quick-fix actions)
 *   - `plantUmlCompletions()` (context-aware autocomplete + snippets)
 *   - `snippetsFor()` (raw snippet table — handy for documentation)
 *
 * The convenience factory `plantUmlSupport({...})` bundles the language,
 * the lint extension, and an `autocompletion` source so a one-call
 * setup gets a complete editing experience.
 */
import { autocompletion } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import { plantUml } from "./language.js";
import { plantUmlLint } from "./lint.js";
import type { PlantUmlLintOptions } from "./lint.js";
import { plantUmlCompletions } from "./autocomplete.js";
import type { PlantUmlAutocompleteOptions } from "./autocomplete.js";

export { plantUml, plantUmlLanguage } from "./language.js";
export { plantUmlHighlightStyle, plantUmlHighlighting, highlightTags } from "./highlight.js";
export type { HighlightTagName } from "./highlight.js";
export { plantUmlLint, computeDiagnostics, runLinter } from "./lint.js";
export type { PlantUmlLintOptions } from "./lint.js";
export { plantUmlCompletions } from "./autocomplete.js";
export type { PlantUmlAutocompleteOptions } from "./autocomplete.js";
export { snippetsFor, SNIPPETS_BY_DIAGRAM } from "./snippets.js";

/**
 * Bundled extension that produces a fully-featured PlantUML editor
 * (language + diagnostics + autocomplete) in one call. Most apps want
 * this; library authors who need finer control compose the individual
 * extensions themselves.
 */
export interface PlantUmlSupportOptions
  extends
    PlantUmlLintOptions,
    Omit<PlantUmlAutocompleteOptions, "diagramType" | "getDiagram" | "idFactory"> {
  /** Toggle diagnostic generation. Defaults to `true`. */
  readonly enableLint?: boolean;
  /** Toggle autocomplete. Defaults to `true`. */
  readonly enableAutocomplete?: boolean;
}

export function plantUmlSupport(options: PlantUmlSupportOptions): Extension[] {
  const extensions: Extension[] = [plantUml()];

  if (options.enableLint !== false) {
    extensions.push(plantUmlLint(options));
  }

  if (options.enableAutocomplete !== false) {
    const completionOptions: PlantUmlAutocompleteOptions = {
      diagramType: options.diagramType,
      ...(options.getDiagram ? { getDiagram: options.getDiagram } : {}),
      ...(options.idFactory ? { idFactory: options.idFactory } : {}),
      ...(options.extraCompletions ? { extraCompletions: options.extraCompletions } : {}),
    };
    extensions.push(
      autocompletion({
        override: [plantUmlCompletions(completionOptions)],
      }),
    );
  }

  return extensions;
}
