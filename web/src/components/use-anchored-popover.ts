"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const GAP = 6;

/** Shows `panelRef` as a top-layer popover under `anchorRef` (or above it when there's no room)
    while `open` is true. It closes like a native menu when the page scrolls, resizes, or the user
    clicks elsewhere, and reports that through `onDismiss`. */
export function useAnchoredPopover<A extends HTMLElement, P extends HTMLElement>(
  open: boolean,
  onDismiss: () => void,
  { maxHeight = 288, minWidth = 0 }: { maxHeight?: number; minWidth?: number } = {},
) {
  const anchorRef = useRef<A>(null);
  const panelRef = useRef<P>(null);
  const dismissedAt = useRef(0);
  const [place, setPlace] = useState<React.CSSProperties>({});
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const anchor = anchorRef.current;
    if (!open || !panel || !anchor) return;
    if (!panel.matches(":popover-open")) panel.showPopover();
    const rect = anchor.getBoundingClientRect();
    const width = Math.max(rect.width, minWidth);
    const height = Math.min(panel.scrollHeight, maxHeight);
    const below = window.innerHeight - rect.bottom - GAP;
    const up = below < height && rect.top > below;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    setPlace({
      left,
      // Grows out of its button (origin awareness): from the button's middle, at the edge facing it.
      transformOrigin: `${Math.round(rect.left + rect.width / 2 - left)}px ${up ? "bottom" : "top"}`,
      minWidth: width,
      maxWidth: Math.max(width, Math.min(420, window.innerWidth - 16)),
      maxHeight: Math.max(120, Math.min(maxHeight, (up ? rect.top : below) - 8)),
      ...(up ? { bottom: window.innerHeight - rect.top + GAP } : { top: rect.bottom + GAP }),
    });
    panel.focus({ preventScroll: true });
  }, [open, maxHeight, minWidth]);

  useEffect(() => {
    if (!open) {
      if (panelRef.current?.matches(":popover-open")) panelRef.current.hidePopover();
      return;
    }
    const onScroll = (e: Event) => {
      if (!panelRef.current?.contains(e.target as Node)) dismiss.current();
    };
    const onResize = () => dismiss.current();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  return {
    anchorRef,
    panelRef,
    place,
    /** Pass to the panel's onToggle: a light dismiss closes the popover without telling React. */
    onToggle: (e: React.SyntheticEvent) => {
      if ((e.nativeEvent as ToggleEvent).newState === "closed" && open) {
        dismissedAt.current = Date.now();
        dismiss.current();
      }
    },
    /** True right after a light dismiss, so the anchor's click doesn't reopen what it just closed. */
    justDismissed: () => Date.now() - dismissedAt.current < 250,
  };
}
