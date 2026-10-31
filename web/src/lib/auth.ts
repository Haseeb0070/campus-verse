import { ApiError, apiFetch, ensureCsrfCookie } from "./api";

const SESSION = "/_allauth/browser/v1/auth/session";

/** Signs in through allauth's headless API. Returns an error message, or null on success. */
export async function signIn(email: string, password: string): Promise<string | null> {
  await ensureCsrfCookie();
  try {
    await apiFetch("/_allauth/browser/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    return null;
  } catch (err) {
    if (err instanceof ApiError && err.status === 400) {
      return "That email and password don't match. Check them and try again.";
    }
    if (err instanceof ApiError && err.status === 429) {
      return "Too many attempts. Wait a few minutes, then try again.";
    }
    if (err instanceof ApiError && err.status === 401) {
      // 401 here means signed in but another step (like email verification) is pending.
      return "Your account needs another step before you can sign in. Contact your admin.";
    }
    return "Couldn't reach CampusVerse. Check your connection and try again.";
  }
}

export async function signOut() {
  await ensureCsrfCookie();
  try {
    await apiFetch(SESSION, { method: "DELETE" });
  } catch (err) {
    // allauth answers a successful sign-out with 401 (no session left).
    if (!(err instanceof ApiError && err.status === 401)) throw err;
  }
}
