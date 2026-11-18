import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ApiError, apiFetch, setSignedOutHandler } from "./api";
import { disconnectRealtime } from "./realtime";
import { tokenStore } from "./token";

/** allauth's headless API for apps: session tokens instead of cookies. */
const BASE = "/_allauth/app/v1";

type Flow = { id: string; is_pending?: boolean };
type AuthBody = { status: number; data?: { flows?: Flow[] }; meta?: { session_token?: string } };

export type SignInResult = { ok: true } | { ok: false; error: string } | { ok: false; needsCode: true };

function firstMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError && err.status === 0) {
    return "Couldn't reach CampusVerse. Check your connection and try again.";
  }
  if (err instanceof ApiError && err.status === 429) {
    return "Too many attempts. Wait a few minutes, then try again.";
  }
  if (err instanceof ApiError && err.status >= 500) {
    return "CampusVerse is having trouble right now. Try again in a minute.";
  }
  if (err instanceof ApiError && err.status === 400) {
    const errors = (err.body as { errors?: { message: string }[] } | null)?.errors;
    return errors?.[0]?.message ?? fallback;
  }
  return fallback;
}

type Status = "loading" | "signedOut" | "signedIn";

interface AuthValue {
  status: Status;
  signIn(email: string, password: string): Promise<SignInResult>;
  verifyCode(code: string): Promise<string | null>;
  cancelCode(): void;
  requestReset(email: string): Promise<string | null>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>("loading");
  // While two-step sign-in waits for its code, allauth tracks the half-done sign-in by this token.
  const [pendingToken, setPendingToken] = useState<string | null>(null);

  const dropSession = useCallback(async () => {
    disconnectRealtime();
    await tokenStore.save(null);
    queryClient.clear();
    setStatus("signedOut");
  }, [queryClient]);

  useEffect(() => {
    setSignedOutHandler(() => void dropSession());
    tokenStore.load().then(async (token) => {
      if (!token) return setStatus("signedOut");
      try {
        // Checks the token is still good, and warms the cache every screen reads.
        await queryClient.fetchQuery({ queryKey: ["me"], queryFn: () => apiFetch("/api/me") });
        setStatus("signedIn");
      } catch (err) {
        // Only a refused token signs you out. Offline, or the server having a bad moment: trust
        // the saved token, and let each screen show its own error and retry.
        if (err instanceof ApiError && err.status === 401) await dropSession();
        else setStatus("signedIn");
      }
    });
    return () => setSignedOutHandler(null);
  }, [dropSession, queryClient]);

  const finish = useCallback(async (body: AuthBody) => {
    const token = body.meta?.session_token;
    if (!token) throw new ApiError(500, body);
    await tokenStore.save(token);
    setPendingToken(null);
    setStatus("signedIn");
  }, []);

  const signIn = useCallback(
    async (email: string, password: string): Promise<SignInResult> => {
      try {
        const body = await apiFetch<AuthBody>(`${BASE}/auth/login`, {
          method: "POST",
          body: JSON.stringify({ email: email.trim(), password }),
        });
        await finish(body);
        return { ok: true };
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          const body = err.body as AuthBody | null;
          if (body?.data?.flows?.some((f) => f.id === "mfa_authenticate" && f.is_pending)) {
            setPendingToken(body.meta?.session_token ?? null);
            return { ok: false, needsCode: true };
          }
          return {
            ok: false,
            error: "Your account needs another step before you can sign in. Contact your admin.",
          };
        }
        if (err instanceof ApiError && err.status === 400) {
          return { ok: false, error: "That email and password don't match. Check them and try again." };
        }
        return { ok: false, error: firstMessage(err, "Something went wrong. Try again.") };
      }
    },
    [finish],
  );

  const verifyCode = useCallback(
    async (code: string) => {
      try {
        const body = await apiFetch<AuthBody>(`${BASE}/auth/2fa/authenticate`, {
          method: "POST",
          headers: pendingToken ? { "X-Session-Token": pendingToken } : undefined,
          body: JSON.stringify({ code: code.replace(/\s+/g, "") }),
        });
        await finish(body);
        return null;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) return "Your sign-in timed out. Start again.";
        return firstMessage(err, "That code didn't work. Check it and try again.");
      }
    },
    [finish, pendingToken],
  );

  const requestReset = useCallback(async (email: string) => {
    try {
      await apiFetch(`${BASE}/auth/password/request`, {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      return null;
    } catch (err) {
      return firstMessage(err, "Couldn't send the email. Check the address and try again.");
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiFetch(`${BASE}/auth/session`, { method: "DELETE" });
    } catch {
      // allauth answers a successful sign-out with 401; offline, the token just stays unused.
    }
    await dropSession();
  }, [dropSession]);

  const value = useMemo(
    () => ({
      status,
      signIn,
      verifyCode,
      cancelCode: () => setPendingToken(null),
      requestReset,
      signOut,
    }),
    [status, signIn, verifyCode, requestReset, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth needs AuthProvider");
  return value;
}
