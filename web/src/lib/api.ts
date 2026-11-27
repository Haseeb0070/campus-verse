import { messageForStatus, reportError } from "./errors";
import { isSleepingReply, wakeServer } from "./wake";

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`Request failed with ${status}`);
  }
}

function csrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

/** Same-origin call to Django through the Next.js proxy. Sends the CSRF token on writes. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  // FormData sets its own multipart boundary; everything else we send is JSON.
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (method !== "GET" && method !== "HEAD") headers.set("X-CSRFToken", csrfToken());

  let res: Response;
  try {
    res = await fetch(path, { ...init, method, headers, credentials: "same-origin" });
  } catch (err) {
    reportError("Couldn't reach CampusVerse. Check your internet connection and try again.", 30_000);
    throw err;
  }
  // A sleeping API: the request never reached Django, so it's safe to send again once it's up.
  if (isSleepingReply(res)) {
    const giveUp = Date.now() + 120_000;
    for (let wait = 2000; isSleepingReply(res) && Date.now() < giveUp; wait = Math.min(wait * 1.5, 8000)) {
      wakeServer();
      await new Promise((r) => setTimeout(r, wait));
      res = await fetch(path, { ...init, method, headers, credentials: "same-origin" });
    }
  }
  if (res.status === 204) return undefined as T;
  const body = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
  if (!res.ok) {
    // Sign-in screens explain their own refusals; everything else that the page can't fix
    // (a refusal, too many tries, a server error) also gets the error pop-up.
    const detail = body && typeof body === "object" && "detail" in body ? String((body as { detail: unknown }).detail) : null;
    const message = path.startsWith("/_allauth") && res.status < 500 ? null : messageForStatus(res.status, detail);
    if (message) reportError(message);
    throw new ApiError(res.status, body);
  }
  return body as T;
}

/** The `detail` message from an API error body, or a fallback. */
export function errorDetail(err: unknown, fallback: string) {
  if (err instanceof ApiError && err.body && typeof err.body === "object" && "detail" in err.body) {
    return String((err.body as { detail: unknown }).detail);
  }
  return fallback;
}

/** Makes sure the CSRF cookie is there (or, with refresh, fetches a new one). */
export async function ensureCsrfCookie(refresh = false) {
  if (refresh || !csrfToken()) await apiFetch("/api/csrf");
}
