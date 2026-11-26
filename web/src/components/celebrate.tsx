"use client";

import { useEffect, useRef } from "react";
import { CheckIcon } from "@/components/icons";

const PIECES = 14;
const COLOURS = ["var(--cv-accent)", "var(--cv-accent-ink)", "#e3a33b", "#4fb3a0", "var(--cv-side-active)"];

/**
 * Peak-end rule: the moment work is handed in gets a small, warm finish. A check pops and a few
 * pieces of confetti fly out, then it's gone (about a second). Reduced motion shows only the check.
 */
export function Celebrate({ message, onDone }: { message: string; onDone: () => void }) {
  // Closes 1.6 s after it appears, even if the page re-renders meanwhile.
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => done.current(), 1600);
    return () => clearTimeout(t);
  }, []);

  return (
    <div role="status" className="pointer-events-none fixed inset-0 z-[90] grid place-items-center">
      <div className="relative grid place-items-center">
        <div className="confetti absolute">
          {Array.from({ length: PIECES }, (_, i) => {
            const angle = (i / PIECES) * Math.PI * 2 + (i % 2 ? 0.2 : -0.1);
            const dist = 90 + (i % 3) * 28;
            return (
              <span
                key={i}
                className="absolute size-2.5 rounded-[3px]"
                style={{
                  background: COLOURS[i % COLOURS.length],
                  ["--dx" as string]: `${Math.cos(angle) * dist}px`,
                  ["--dy" as string]: `${Math.sin(angle) * dist}px`,
                  ["--rot" as string]: `${(i % 2 ? 1 : -1) * (120 + i * 17)}deg`,
                  animationDelay: `${(i % 4) * 25}ms`,
                }}
              />
            );
          })}
        </div>
        <div className="check-pop flex flex-col items-center gap-2 rounded-card bg-[var(--cv-surface)] px-6 py-5 shadow-2xl">
          <span className="grid size-14 place-items-center rounded-full bg-success text-white">
            <CheckIcon className="size-8" />
          </span>
          <span className="text-headline font-semibold">{message}</span>
        </div>
      </div>
    </div>
  );
}
