"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Asks before leaving a form with unsaved changes. Following a link in the app or pressing Back
 * opens a dialog ("Keep editing" / "Leave"); reloading or closing the tab gets the browser's own
 * warning (browsers don't let a page style that one). Off whenever `when` is false, so a form
 * that's just been saved navigates away freely.
 */
export function LeaveGuard({ when, what = "your changes" }: { when: boolean; what?: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  /** Where the person was going: a path, or "back" for the Back button. */
  const [pending, setPending] = useState<string | null>(null);
  const armed = useRef(false);
  const leaving = useRef(false);

  // Reload / close tab: the browser asks.
  useEffect(() => {
    if (!when) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      if (leaving.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [when]);

  // Links in the app (sidebar, back links, tabs): caught before Next.js navigates.
  useEffect(() => {
    if (!when) return;
    const onClick = (e: MouseEvent) => {
      if (leaving.current || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // a new tab keeps this one
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setPending(url.pathname + url.search + url.hash);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [when]);

  // The Back button: a spare history entry for this page catches it.
  useEffect(() => {
    if (!when) return;
    if (!armed.current) {
      window.history.pushState({ leaveGuard: true }, "", window.location.href);
      armed.current = true;
    }
    const onPop = () => {
      if (leaving.current) return;
      window.history.pushState({ leaveGuard: true }, "", window.location.href);
      setPending("back");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [when]);

  useEffect(() => {
    if (pending && !dialog.current?.open) dialog.current?.showModal();
  }, [pending]);

  function stay() {
    dialog.current?.close();
    setPending(null);
  }

  function leave() {
    const to = pending;
    leaving.current = true;
    dialog.current?.close();
    setPending(null);
    if (to === "back") window.history.go(-2); // past the spare entry, to the page before
    else if (to) router.push(to);
  }

  return (
    <dialog
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault(); // Escape keeps editing
        stay();
      }}
      aria-labelledby="leave-title"
      aria-describedby="leave-body"
      className="m-auto w-[min(26rem,calc(100%-2rem))] rounded-card border border-divider bg-[var(--cv-bg)] p-0 text-ink shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm"
    >
      <div className="arrive flex flex-col gap-3 p-6">
        <h2 id="leave-title" className="text-title-2 font-bold">Leave without saving?</h2>
        <p id="leave-body" className="text-body text-ink-2">
          You haven&apos;t saved {what}. If you leave now, what you&apos;ve entered is lost.
        </p>
        <div className="mt-2 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={leave}
            className="press h-11 rounded-full px-5 text-body font-semibold text-danger-ink hover:bg-danger/10">
            Leave
          </button>
          <button type="button" autoFocus onClick={stay}
            className="press h-11 rounded-full bg-accent px-5 text-body font-semibold text-on-accent">
            Keep editing
          </button>
        </div>
      </div>
    </dialog>
  );
}
