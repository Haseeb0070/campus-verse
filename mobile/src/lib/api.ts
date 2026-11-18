import { API_URL } from "./config";
import { tokenStore } from "./token";

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`Request failed with ${status}`);
  }
}

/** Called when the server no longer accepts our session token. */
let onSignedOut: (() => void) | null = null;
export function setSignedOutHandler(handler: (() => void) | null) {
  onSignedOut = handler;
}

/**
 * Calls Django with the app's session token. Paths start with "/api" or "/_allauth", like the web
 * app's. No cookies and no CSRF: the token header is the only credential.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = tokenStore.current();
  if (token) headers.set("X-Session-Token", token);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, method, headers, credentials: "omit" });
  } catch {
    throw new ApiError(0, null); // offline, or the server is unreachable
  }
  if (res.status === 204) return undefined as T;
  const body = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
  if (!res.ok) {
    // The API (not allauth's own flow endpoints) refusing our token means it expired or was
    // revoked: drop it and go back to sign-in.
    if (res.status === 401 && token && path.startsWith("/api/")) onSignedOut?.();
    throw new ApiError(res.status, body);
  }
  return body as T;
}

/** The `detail` message from an API error body, or a fallback. */
export function errorDetail(err: unknown, fallback: string) {
  if (err instanceof ApiError && err.status === 0) {
    return "Couldn't reach CampusVerse. Check your connection and try again.";
  }
  if (err instanceof ApiError && err.body && typeof err.body === "object" && "detail" in err.body) {
    return String((err.body as { detail: unknown }).detail);
  }
  return fallback;
}

/** A file to upload, as React Native's FormData wants it (or a browser File on web). */
export type UploadFile = { uri: string; name: string; type: string; size?: number; file?: Blob };

export function appendFile(form: FormData, field: string, f: UploadFile) {
  if (f.file) form.append(field, f.file, f.name);
  // React Native reads {uri, name, type} objects; the DOM typings don't know that.
  else form.append(field, { uri: f.uri, name: f.name, type: f.type } as unknown as Blob);
}
