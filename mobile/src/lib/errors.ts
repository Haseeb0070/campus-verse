/*
 * One place that tells people when something went wrong, like the website's: apiFetch reports a
 * lost connection, a refusal, too many tries or a server error, and ErrorPopup shows it. Form
 * mistakes (a wrong password, a missing field) stay next to their form instead.
 */

type Listener = (message: string) => void;
const listeners = new Set<Listener>();
let lastMessage = "";
let lastAt = 0;

/** Shows the pop-up. The same message again within `quietMs` shows once (an offline phone's
 *  background refreshes don't pile up). */
export function reportError(message: string, quietMs = 4000) {
  const now = Date.now();
  if (message === lastMessage && now - lastAt < quietMs) return;
  lastMessage = message;
  lastAt = now;
  listeners.forEach((l) => l(message));
}

export function onError(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** What to tell people about a failed request, or null when the screen shows it itself. */
export function messageForStatus(status: number, detail: string | null): string | null {
  if (status === 403) return detail || "You don't have permission to do that.";
  if (status === 429) return detail || "Too many tries in a short time. Wait a minute and try again.";
  if (status >= 500) return "CampusVerse had a problem on its side. Try again in a moment.";
  return null;
}
