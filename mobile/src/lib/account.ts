import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "./api";

const BASE = "/_allauth/app/v1";

/** allauth wants the password confirmed before a sensitive change; ask, confirm, then retry. */
export class NeedsPassword extends Error {}

function message(err: unknown, fallback: string) {
  if (err instanceof NeedsPassword) return "Confirm your password first.";
  if (err instanceof ApiError && err.status === 0) return "Couldn't reach CampusVerse. Check your connection.";
  if (err instanceof ApiError && err.status === 429) return "Too many attempts. Wait a few minutes, then try again.";
  if (err instanceof ApiError && err.status === 400) {
    const errors = (err.body as { errors?: { message: string }[] } | null)?.errors;
    return errors?.[0]?.message ?? fallback;
  }
  return fallback;
}
export { message as accountError };

export async function account<T>(method: string, path: string, body?: unknown): Promise<T> {
  try {
    return await apiFetch<T>(`${BASE}${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (err) {
    const flows = err instanceof ApiError && err.status === 401
      ? ((err.body as { data?: { flows?: { id: string }[] } } | null)?.data?.flows ?? [])
      : [];
    if (flows.some((f) => f.id === "reauthenticate")) throw new NeedsPassword();
    throw err;
  }
}

export async function confirmPassword(password: string): Promise<string | null> {
  try {
    await apiFetch(`${BASE}/auth/reauthenticate`, { method: "POST", body: JSON.stringify({ password }) });
    return null;
  } catch (err) {
    return message(err, "That password isn't right.");
  }
}

export async function changePassword(current: string, next: string): Promise<string | null> {
  try {
    await account("POST", "/account/password/change", { current_password: current, new_password: next });
    return null;
  } catch (err) {
    return message(err, "That didn't work. Check your current password.");
  }
}

export interface TotpSetup {
  secret: string;
  totp_url: string;
}

/** The pending secret to add to an authenticator app, or null when two-step sign-in is on. */
export async function totpSetup(): Promise<TotpSetup | null> {
  try {
    await account("GET", "/account/authenticators/totp");
    return null;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return (err.body as { meta: TotpSetup }).meta;
    throw err;
  }
}

export async function activateTotp(code: string): Promise<string[]> {
  await account("POST", "/account/authenticators/totp", { code: code.replace(/\s+/g, "") });
  return recoveryCodes(false);
}

export async function recoveryCodes(fresh: boolean): Promise<string[]> {
  const r = await account<{ data: { unused_codes: string[] } }>(fresh ? "POST" : "GET", "/account/authenticators/recovery-codes");
  return r.data.unused_codes;
}

export async function turnOffTotp() {
  await account("DELETE", "/account/authenticators/totp");
}

// Corrections: asking the college to fix your name, email or courses --------------------------

export type CorrectionTopic = "name" | "email" | "enrollment" | "other";

export const TOPICS: { key: CorrectionTopic; label: string }[] = [
  { key: "name", label: "My name" },
  { key: "email", label: "My email" },
  { key: "enrollment", label: "My courses or subjects" },
  { key: "other", label: "Something else" },
];

export interface Correction {
  id: number;
  topic: CorrectionTopic;
  topic_label: string;
  details: string;
  status: "open" | "resolved" | "declined";
  response: string;
  created_at: string;
  resolved_at: string | null;
}

export function useCorrections() {
  return useQuery({ queryKey: ["corrections"], queryFn: () => apiFetch<Correction[]>("/api/me/corrections") });
}

export function useAskCorrection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { topic: CorrectionTopic; details: string }) =>
      apiFetch<Correction>("/api/me/corrections", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["corrections"] }),
  });
}
