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
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (method !== "GET" && method !== "HEAD") headers.set("X-CSRFToken", csrfToken());

  const res = await fetch(path, { ...init, method, headers, credentials: "same-origin" });
  if (res.status === 204) return undefined as T;
  const body = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export async function ensureCsrfCookie() {
  if (!csrfToken()) await apiFetch("/api/csrf");
}
