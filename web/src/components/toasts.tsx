"use client";

import Link from "next/link";
import type { Toast } from "@/lib/notifications";
import { BellIcon } from "./icons";

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 top-4 z-50 flex flex-col items-end gap-2 md:inset-x-auto md:right-6 md:w-96"
    >
      {toasts.map((t) => (
        <div key={t.id} className="glass-thick arrive pointer-events-auto flex w-full gap-3 rounded-[20px] p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/15 text-accent-ink">
            <BellIcon className="size-5" />
          </span>
          <Link href={t.link || "/notifications"} onClick={() => onDismiss(t.id)} className="min-w-0 flex-1">
            <span className="block text-body font-semibold">{t.title}</span>
            {t.body && <span className="line-clamp-2 block text-footnote text-ink-2">{t.body}</span>}
          </Link>
          <button
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss"
            className="press grid size-7 shrink-0 place-items-center self-start rounded-full text-ink-3 hover:bg-fill-strong"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
