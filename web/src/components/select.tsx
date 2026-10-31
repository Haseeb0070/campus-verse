"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CheckIcon, ChevronDownIcon } from "./icons";
import { useAnchoredPopover } from "./use-anchored-popover";

export interface SelectOption {
  value: string;
  label: string;
  detail?: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Names the list for screen readers; the trigger is named by its surrounding <label>. */
  label: string;
  placeholder?: string;
  disabled?: boolean;
  /** Classes for the trigger, so it matches the field it sits beside. */
  className?: string;
}

/** A themed replacement for <select>: a glass menu in the browser's top layer (so it also works
    inside modal dialogs), keyboard-driven like a native list box, with type-to-jump. */
export function Select({
  value,
  onChange,
  options,
  label,
  placeholder = "Choose…",
  disabled,
  className = "",
}: SelectProps) {
  const id = useId();
  const typed = useRef({ text: "", at: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const popover = useAnchoredPopover<HTMLButtonElement, HTMLUListElement>(open, () =>
    setOpen(false),
  );
  const { anchorRef: buttonRef, panelRef: listRef, place } = popover;
  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = options[selectedIndex];

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  }, [buttonRef]);

  function show() {
    if (disabled || options.length === 0) return;
    setActive(Math.max(selectedIndex, 0));
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    if (option && option.value !== value) onChange(option.value);
    close();
  }

  useEffect(() => {
    if (open) listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, listRef]);

  function jumpTo(key: string, from: number) {
    const now = Date.now();
    typed.current = {
      text: now - typed.current.at < 700 ? typed.current.text + key.toLowerCase() : key.toLowerCase(),
      at: now,
    };
    const start = typed.current.text.length === 1 ? from + 1 : Math.max(from, 0);
    for (let i = 0; i < options.length; i++) {
      const index = (start + i) % options.length;
      if (options[index].label.toLowerCase().startsWith(typed.current.text)) return index;
    }
    return null;
  }

  function onListKey(e: React.KeyboardEvent) {
    const last = options.length - 1;
    const keys: Record<string, () => void> = {
      ArrowDown: () => setActive((i) => Math.min(last, i + 1)),
      ArrowUp: () => setActive((i) => Math.max(0, i - 1)),
      Home: () => setActive(0),
      End: () => setActive(last),
      PageDown: () => setActive((i) => Math.min(last, i + 8)),
      PageUp: () => setActive((i) => Math.max(0, i - 8)),
      Enter: () => choose(active),
      " ": () => choose(active),
      Escape: () => close(),
      Tab: () => close(),
    };
    if (keys[e.key]) {
      if (e.key !== "Tab") e.preventDefault();
      e.stopPropagation(); // keep Escape from also closing a surrounding dialog
      keys[e.key]();
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const index = jumpTo(e.key, active);
      if (index !== null) setActive(index);
    }
  }

  function onButtonKey(e: React.KeyboardEvent) {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      show();
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Typing on a closed menu changes the choice directly, like a native select.
      const index = jumpTo(e.key, selectedIndex);
      if (index !== null && options[index].value !== value) onChange(options[index].value);
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        onClick={() => {
          // A click on the trigger first light-dismisses the open menu; don't reopen it.
          if (popover.justDismissed()) return;
          if (open) close();
          else show();
        }}
        onKeyDown={onButtonKey}
        className={`flex items-center justify-between gap-2 text-left disabled:opacity-60 ${className}`}
      >
        <span className={`min-w-0 truncate ${selected ? "" : "text-ink-3"}`}>
          {selected ? selected.label : placeholder}
          {selected?.detail && <span className="font-normal text-ink-2"> · {selected.detail}</span>}
        </span>
        <ChevronDownIcon
          className={`size-4 shrink-0 text-ink-2 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
        />
      </button>
      <ul
        ref={listRef}
        id={`${id}-list`}
        popover="auto"
        role="listbox"
        aria-label={label}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        tabIndex={-1}
        onKeyDown={onListKey}
        // Inside a <label>, a click here would otherwise "activate" the label and reopen the menu.
        onClick={(e) => e.preventDefault()}
        onToggle={popover.onToggle}
        style={place}
        className="glass-thick menu-pop fixed inset-auto m-0 overflow-y-auto rounded-[14px] p-1 text-body text-ink outline-none"
      >
        {open &&
          options.map((o, i) => {
            const isActive = i === active;
            const isSelected = o.value === value;
            return (
              <li
                key={o.value}
                id={`${id}-${i}`}
                data-index={i}
                role="option"
                aria-selected={isSelected}
                onPointerMove={() => setActive(i)}
                onClick={() => choose(i)}
                className={`flex min-h-9 cursor-default select-none items-center gap-2 rounded-[9px] py-1.5 pr-3 pl-2 ${
                  isActive ? "bg-accent text-on-accent" : ""
                }`}
              >
                <CheckIcon className={`size-4 shrink-0 ${isSelected ? "" : "invisible"}`} />
                <span className="min-w-0">
                  <span className={isSelected ? "font-semibold" : ""}>{o.label}</span>
                  {o.detail && (
                    <span className={`block truncate text-footnote ${isActive ? "text-on-accent" : "text-ink-2"}`}>
                      {o.detail}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
      </ul>
    </>
  );
}
