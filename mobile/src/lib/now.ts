import { useEffect, useState } from "react";

/** The current time, updated every `everyMs`, so "in 25 min" and "Done" stay true on screen. */
export function useNow(everyMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}
