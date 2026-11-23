/*
 * The API runs on Render's free plan, which puts it to sleep after 15 quiet minutes. While it
 * sleeps, Render's front door answers requests that come from Vercel's servers (our proxy) with
 * a "Just a moment…" check page (429, sometimes 502/503) instead of waking it. A request straight
 * from the visitor's own browser does wake it. So when a proxied call bounces like that, the
 * browser pings the API directly, and the call is retried until the API is up (about a minute).
 */

const DIRECT = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";
const EVENT = "cv-waking";

let lastPing = 0;

/** Pings the API straight from this browser so a sleeping server starts. Cheap; no reply read. */
export function wakeServer() {
  if (typeof window === "undefined" || !DIRECT || Date.now() - lastPing < 5000) return;
  lastPing = Date.now();
  fetch(`${DIRECT}/api/health`, { mode: "no-cors", cache: "no-store" }).catch(() => {});
}

/** A reply from Render's front door rather than from Django: a check or error page, not JSON. */
export function isSleepingReply(res: Response): boolean {
  return [429, 502, 503, 504].includes(res.status) && !res.headers.get("content-type")?.includes("json");
}

export function announceWaking(waking: boolean) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT, { detail: waking }));
}

export function onWaking(listener: (waking: boolean) => void) {
  const handler = (e: Event) => listener(Boolean((e as CustomEvent).detail));
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
