"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CloseIcon } from "@/components/icons";
import { onError, reportError } from "@/lib/errors";

type Shown = { id: number; message: string };

/**
 * The error pop-up: a card at the bottom of the screen whenever something goes wrong that the
 * page can't explain itself (no connection, a server error, a refusal, a crash). It stays 7
 * seconds, or until closed, and never covers more than one line of messages at a time.
 */
export function ErrorPopup() {
  const [items, setItems] = useState<Shown[]>([]);
  const layer = useRef<HTMLDivElement>(null);

  // In the browser's top layer (a popover), shown again whenever a message arrives, so it sits
  // above any open dialog (the sign-in box, a form) rather than behind it.
  useLayoutEffect(() => {
    const el = layer.current;
    if (!el || items.length === 0) return;
    try {
      if (el.matches(":popover-open")) el.hidePopover();
      el.showPopover();
    } catch {
      // Older browsers without popovers: the fixed position and z-index still show it.
    }
  }, [items]);

  useEffect(() => {
    let next = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const add = (message: string) => {
      const id = ++next;
      setItems((list) => [...list.filter((i) => i.message !== message), { id, message }].slice(-3));
      timers.push(setTimeout(() => setItems((list) => list.filter((i) => i.id !== id)), 7000));
    };
    const off = onError(add);

    // A crash in the page itself: say so instead of leaving a half-broken screen unexplained.
    const crashed = (reason: unknown) => {
      const text = String((reason as { message?: string })?.message ?? reason ?? "");
      if (/ResizeObserver loop|AbortError|aborted/i.test(text)) return; // harmless browser noise
      if (/ChunkLoadError|Loading chunk|dynamically imported module/i.test(text)) {
        reportError("CampusVerse was just updated. Reload the page to get the new version.", 60_000);
        return;
      }
      reportError("Something went wrong on this page. Try again, or reload it.");
    };
    const onCrash = (e: ErrorEvent) => crashed(e.error ?? e.message);
    const onReject = (e: PromiseRejectionEvent) => {
      // Failed requests were already reported (or shown by their form) in apiFetch.
      if ((e.reason as { name?: string })?.name === "Error" && /Request failed with/.test(String(e.reason?.message))) return;
      if (e.reason instanceof TypeError && /fetch/i.test(e.reason.message)) return;
      crashed(e.reason);
    };
    window.addEventListener("error", onCrash);
    window.addEventListener("unhandledrejection", onReject);
    return () => {
      off();
      timers.forEach(clearTimeout);
      window.removeEventListener("error", onCrash);
      window.removeEventListener("unhandledrejection", onReject);
    };
  }, []);

  if (items.length === 0) return null;
  return (
    <div ref={layer} popover="manual" aria-live="assertive"
      className="pointer-events-none fixed inset-x-0 top-auto bottom-24 z-[110] m-0 flex w-full flex-col items-center gap-2 overflow-visible border-0 bg-transparent p-0 px-4 md:bottom-6">
      {items.map((i) => (
        <div key={i.id} role="alert"
          className="arrive pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-card border border-danger/30 bg-[var(--cv-surface)] px-4 py-3 shadow-2xl">
          <span aria-hidden="true" className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-danger text-caption font-bold text-white">!</span>
          <p className="min-w-0 flex-1 text-footnote font-medium text-ink">{i.message}</p>
          <button onClick={() => setItems((list) => list.filter((x) => x.id !== i.id))} aria-label="Close"
            className="press -mr-1 grid size-7 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-fill">
            <CloseIcon className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
