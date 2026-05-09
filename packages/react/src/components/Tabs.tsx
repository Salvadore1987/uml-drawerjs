import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

export interface TabDescriptor {
  /** Stable id used as both `aria-controls` target and React key. */
  readonly id: string;
  /** Label rendered inside the tab button — string or rich content. */
  readonly label: ReactNode;
  /** Body of the tab — only rendered when active (or always, see `keepMounted`). */
  readonly content: ReactNode;
  /** Disabled tabs are skipped by keyboard navigation and not selectable. */
  readonly disabled?: boolean;
}

export interface TabsProps {
  /** Tab descriptors, rendered in order. At least one required. */
  readonly tabs: readonly TabDescriptor[];
  /** Controlled active tab id. Pair with `onChange`. */
  readonly value?: string;
  /** Initial active tab id when `value` is not supplied. Defaults to `tabs[0].id`. */
  readonly defaultValue?: string;
  /** Fires when the user activates a different tab. */
  readonly onChange?: (id: string) => void;
  /**
   * Where the tab strip sits relative to the panels. Defaults to
   * `"bottom"` — DevTools-style, which the playground uses to keep the
   * Designer/PlantUML toggle out of the way of canvas controls.
   */
  readonly tabsPosition?: "top" | "bottom";
  /**
   * Render *all* panels and toggle visibility via the HTML `hidden`
   * attribute. Lets stateful panels (e.g. an SVG canvas with pan/zoom)
   * survive a tab switch without being unmounted. Defaults to `false`.
   */
  readonly keepMounted?: boolean;
  readonly className?: string;
  readonly "aria-label"?: string;
  readonly "aria-labelledby"?: string;
}

/**
 * A11y-conformant tablist primitive (W3C ARIA Authoring Practices).
 * Auto-activates on arrow keys (Radix-style) so the user doesn't need
 * an extra Enter — keeps the Designer/PlantUML toggle one keystroke away.
 *
 * The component is style-agnostic: every visual decision lives in CSS
 * (`.uml-tabs*` classes consume the theming contract). Consumers can
 * fully restyle it via the contract tokens without touching this code.
 */
export function Tabs({
  tabs,
  value,
  defaultValue,
  onChange,
  tabsPosition = "bottom",
  keepMounted = false,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: TabsProps): JSX.Element {
  if (tabs.length === 0) {
    throw new Error("<Tabs /> requires at least one tab descriptor.");
  }

  const baseId = useId();
  const isControlled = value !== undefined;
  const firstEnabled = tabs.find((t) => !t.disabled)?.id ?? tabs[0]!.id;
  const [internalValue, setInternalValue] = useState<string>(defaultValue ?? firstEnabled);

  const activeId = isControlled ? value : internalValue;
  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.id === activeId),
  );

  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const activate = useCallback(
    (nextId: string): void => {
      if (nextId === activeId) return;
      if (!isControlled) setInternalValue(nextId);
      onChange?.(nextId);
    },
    [activeId, isControlled, onChange],
  );

  // If a controlled `value` falls out of the available set (e.g. a tab
  // is removed), we don't override the parent — the parent owns state.
  // For the uncontrolled flavour, snap back to the first enabled tab so
  // the focus / activation invariant holds.
  useEffect(() => {
    if (isControlled) return;
    if (tabs.some((t) => t.id === internalValue)) return;
    setInternalValue(firstEnabled);
  }, [firstEnabled, internalValue, isControlled, tabs]);

  const focusTab = (index: number): void => {
    const ref = tabRefs.current[index];
    if (ref) ref.focus();
  };

  const moveFocus = (from: number, direction: 1 | -1): void => {
    const length = tabs.length;
    let next = from;
    for (let step = 0; step < length; step += 1) {
      next = (next + direction + length) % length;
      if (!tabs[next]!.disabled) break;
    }
    if (tabs[next]!.disabled) return;
    activate(tabs[next]!.id);
    focusTab(next);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        moveFocus(index, 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        moveFocus(index, -1);
        break;
      case "Home": {
        event.preventDefault();
        const first = tabs.findIndex((t) => !t.disabled);
        if (first >= 0) {
          activate(tabs[first]!.id);
          focusTab(first);
        }
        break;
      }
      case "End": {
        event.preventDefault();
        for (let i = tabs.length - 1; i >= 0; i -= 1) {
          if (!tabs[i]!.disabled) {
            activate(tabs[i]!.id);
            focusTab(i);
            break;
          }
        }
        break;
      }
      default:
        break;
    }
  };

  const composedRoot = ["uml-tabs", `uml-tabs--position-${tabsPosition}`, className]
    .filter(Boolean)
    .join(" ");

  const tabId = (id: string): string => `${baseId}-tab-${id}`;
  const panelId = (id: string): string => `${baseId}-panel-${id}`;

  return (
    <div className={composedRoot} data-uml-tabs="">
      <div
        className="uml-tabs__list"
        role="tablist"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
      >
        {tabs.map((tab, index) => {
          const selected = tab.id === activeId;
          return (
            <button
              key={tab.id}
              ref={(node): void => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={tabId(tab.id)}
              className="uml-tabs__tab"
              aria-selected={selected}
              aria-controls={panelId(tab.id)}
              tabIndex={selected ? 0 : -1}
              disabled={tab.disabled}
              data-uml-tab={tab.id}
              onClick={(): void => {
                if (!tab.disabled) activate(tab.id);
              }}
              onKeyDown={(event): void => handleKeyDown(event, index)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div className="uml-tabs__panels">
        {keepMounted
          ? tabs.map((tab) => {
              const selected = tab.id === activeId;
              return (
                <div
                  key={tab.id}
                  className="uml-tabs__panel"
                  role="tabpanel"
                  id={panelId(tab.id)}
                  aria-labelledby={tabId(tab.id)}
                  data-uml-panel={tab.id}
                  hidden={!selected}
                >
                  {tab.content}
                </div>
              );
            })
          : (() => {
              const tab = tabs[activeIndex]!;
              return (
                <div
                  key={tab.id}
                  className="uml-tabs__panel"
                  role="tabpanel"
                  id={panelId(tab.id)}
                  aria-labelledby={tabId(tab.id)}
                  data-uml-panel={tab.id}
                >
                  {tab.content}
                </div>
              );
            })()}
      </div>
    </div>
  );
}
