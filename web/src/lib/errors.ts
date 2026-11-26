/*
 * One place that tells people when something went wrong: apiFetch reports failed connections,
 * server errors, refusals and rate limits; the page reports crashes. ErrorPopup shows them.
 * Form mistakes (wrong password, a missing field) stay next to their form instead.
 */

const EVENT = "cv-error";

let lastMessage = "";
let lastAt = 0;

/** Shows the error pop-up. The same message again within `quietMs` shows once (background
 *  refreshes that keep failing while offline don't pile up). */
export function reportError(message: string, quietMs = 4000) {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (message === lastMessage && now - lastAt < quietMs) return;
  lastMessage = message;
  lastAt = now;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: message }));
}

export function onError(listener: (message: string) => void) {
  const handler = (e: Event) => listener(String((e as CustomEvent).detail));
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

/** What to tell people about a failed request, or null when the page shows it itself. */
export function messageForStatus(status: number, detail: string | null): string | null {
  if (status === 403) return detail || "You don't have permission to do that.";
  if (status === 429) return detail || "Too many tries in a short time. Wait a minute and try again.";
  if (status >= 500) return "CampusVerse had a problem on its side. Try again in a moment.";
  return null; // 400/401/404/409/422: shown next to the form or handled by the page
}
