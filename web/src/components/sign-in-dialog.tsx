"use client";

import { useEffect, useRef } from "react";
import { CloseIcon, LogoMark } from "@/components/icons";
import { SignInForm } from "@/components/sign-in-form";

/**
 * Sign in as a small popup over the page (a native modal dialog: it sits in the top layer, keeps
 * keyboard focus inside while open, and closes with Escape, the × button or a click outside).
 */
export function SignInDialog({
  open,
  onClose,
  email,
  next,
}: {
  open: boolean;
  onClose: () => void;
  email?: string;
  next?: string | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="signin-title"
      onClose={onClose}
      // A click on the dimmed backdrop (the dialog element itself, outside the card) closes it.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-auto w-[calc(100%-32px)] max-w-[380px] rounded-card bg-surface p-0 text-ink shadow-[0_24px_60px_-12px_rgb(40_25_10/0.45)] backdrop:bg-[rgb(36_30_24/0.5)] open:animate-[cv-menu_160ms_cubic-bezier(0.2,0.9,0.3,1)] motion-reduce:open:animate-none"
    >
      <div className="relative p-6">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="press absolute right-3 top-3 grid size-9 place-items-center rounded-full text-ink-2 hover:bg-fill"
        >
          <CloseIcon className="size-5" />
        </button>
        <div className="mb-5 flex items-center gap-3">
          <LogoMark className="size-10 rounded-[12px]" />
          <div>
            <h2 id="signin-title" className="text-title-2 font-bold">
              Sign in
            </h2>
            <p className="text-footnote text-ink-2">Use the email your institution gave you.</p>
          </div>
        </div>
        {/* Remounted on every open, so the form starts fresh. */}
        {open && <SignInForm initialEmail={email} next={next} />}
        <p className="mt-4 text-center text-caption text-ink-3">
          No account yet? Your institution creates it; ask your admin.
        </p>
      </div>
    </dialog>
  );
}
