import { ApiError, apiFetch, ensureCsrfCookie } from "./api";

const BASE = "/_allauth/browser/v1";
const SESSION = `${BASE}/auth/session`;

type Flow = { id: string; is_pending?: boolean };

function flowsOf(err: unknown): Flow[] {
  if (!(err instanceof ApiError) || err.status !== 401) return [];
  return (err.body as { data?: { flows?: Flow[] } } | null)?.data?.flows ?? [];
}

function firstMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError && err.status === 400) {
    const errors = (err.body as { errors?: { message: string }[] } | null)?.errors;
    return errors?.[0]?.message ?? fallback;
  }
  if (err instanceof ApiError && err.status === 429) return "Too many attempts. Wait a few minutes, then try again.";
  return fallback;
}

export type SignInResult = { ok: true } | { ok: false; error: string } | { ok: false; needsCode: true };

/** Signs in through allauth's headless API. With two-step sign-in on, a code is needed next. */
export async function signIn(email: string, password: string): Promise<SignInResult> {
  await ensureCsrfCookie();
  try {
    await apiFetch(`${BASE}/auth/login`, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    return { ok: true };
  } catch (err) {
    if (flowsOf(err).some((f) => f.id === "mfa_authenticate" && f.is_pending)) {
      return { ok: false, needsCode: true };
    }
    if (err instanceof ApiError && err.status === 400) {
      const codes = ((err.body as { errors?: { code?: string }[] } | null)?.errors ?? []).map((e) => e.code);
      if (codes.includes("too_many_login_attempts")) {
        return { ok: false, error: "Too many wrong passwords for this account. Wait 5 minutes, then try again, or use Forgot password." };
      }
      return { ok: false, error: "That email and password don't match. Check them and try again." };
    }
    if (err instanceof ApiError && err.status === 429) {
      return { ok: false, error: "Too many sign-ins from this network. Wait a minute, then try again." };
    }
    if (err instanceof ApiError && [502, 503, 504].includes(err.status)) {
      return { ok: false, error: "CampusVerse is starting up. Try again in a minute." };
    }
    if (err instanceof ApiError && err.status === 401) {
      // 401 here means signed in but another step (like email verification) is pending.
      return { ok: false, error: "Your account needs another step before you can sign in. Contact your admin." };
    }
    // 409: this browser is already signed in (another tab, or the back button), so carry on.
    if (err instanceof ApiError && err.status === 409) return { ok: true };
    return { ok: false, error: "Couldn't reach CampusVerse. Check your connection and try again." };
  }
}

/** The second step: a code from the authenticator app, or a recovery code. */
export async function verifyCode(code: string): Promise<string | null> {
  try {
    await apiFetch(`${BASE}/auth/2fa/authenticate`, {
      method: "POST",
      body: JSON.stringify({ code: code.replace(/\s+/g, "") }),
    });
    return null;
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) return "Your sign-in timed out. Start again.";
    return firstMessage(err, "That code didn't work. Check it and try again.");
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

// Account security -------------------------------------------------------------------------------

export class NeedsPassword extends Error {}

/** Calls an allauth account endpoint. Sensitive ones may first want the password confirmed:
    that throws NeedsPassword, so the screen can ask and call confirmPassword, then retry. */
export async function account<T>(method: string, path: string, body?: unknown): Promise<T> {
  await ensureCsrfCookie();
  try {
    return await apiFetch<T>(`${BASE}${path}`, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (flowsOf(err).some((f) => f.id === "reauthenticate")) throw new NeedsPassword();
    throw err;
  }
}

export async function confirmPassword(password: string): Promise<string | null> {
  try {
    await apiFetch(`${BASE}/auth/reauthenticate`, { method: "POST", body: JSON.stringify({ password }) });
    return null;
  } catch (err) {
    return firstMessage(err, "That password isn't right.");
  }
}

export interface TotpSetup {
  secret: string;
  totp_url: string;
}

/** The pending secret to show as a QR code, or null when two-step sign-in is already on. */
export async function totpSetup(): Promise<TotpSetup | null> {
  try {
    await account("GET", "/account/authenticators/totp");
    return null;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return (err.body as { meta: TotpSetup }).meta;
    }
    throw err;
  }
}

export { firstMessage as allauthError };

/** Asks for a reset link by email. Says the same whether or not the address has an account, so
 *  nobody can use it to find out who's registered. Returns an error message, or null. */
export async function requestPasswordReset(email: string): Promise<string | null> {
  await ensureCsrfCookie();
  try {
    await apiFetch(`${BASE}/auth/password/request`, {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    return null;
  } catch (err) {
    if (err instanceof ApiError && err.status === 429) return "Too many requests. Wait a few minutes, then try again.";
    if (err instanceof ApiError && err.status === 400) return firstMessage(err, "Enter a valid email address.");
    return null; // never reveal more than "if it has an account, a link is on its way"
  }
}
