"use client";

import { useEffect, useState } from "react";
import { onWaking, wakeServer } from "@/lib/wake";

/**
 * Starts the API as soon as anyone opens the site (so it's usually up by the time they sign in),
 * and while a request waits for it, says so instead of showing an error.
 */
export function WakingNotice() {
  const [waking, setWaking] = useState(false);
  useEffect(() => {
    wakeServer();
    return onWaking(setWaking);
  }, []);
  if (!waking) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-3 z-[100] mx-auto w-fit max-w-[calc(100%-2rem)] rounded-full bg-ink px-4 py-2 text-footnote font-semibold text-bg shadow-lg"
    >
      Waking up CampusVerse, this takes up to a minute…
    </div>
  );
}
