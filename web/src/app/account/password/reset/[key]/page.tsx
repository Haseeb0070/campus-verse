"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/icons";
import { ApiError, apiFetch, ensureCsrfCookie } from "@/lib/api";

const RESET = "/_allauth/browser/v1/auth/password/reset";

type KeyState = "checking" | "valid" | "invalid";

export default function SetPasswordPage() {
  const { key } = useParams<{ key: string }>();
  const router = useRouter();
  const [state, setState] = useState<KeyState>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<{ data?: { user?: { email?: string } } }>(RESET, {
      headers: { "X-Password-Reset-Key": decodeURIComponent(key) },
    })
      .then((res) => {
        setEmail(res?.data?.user?.email ?? "");
        setState("valid");
      })
      .catch(() => setState("invalid"));
  }, [key]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 10) return setError("Use at least 10 characters.");
    if (password !== confirm) return setError("The two passwords don't match.");
    setError(null);
    setBusy(true);
    await ensureCsrfCookie();
    try {
      await apiFetch(RESET, {
        method: "POST",
        body: JSON.stringify({ key: decodeURIComponent(key), password }),
      });
      router.replace("/today");
    } catch (err) {
      // 401 means the password was set but this flow needs a fresh sign-in.
      if (err instanceof ApiError && err.status === 401) return router.replace("/sign-in");
      const body = err instanceof ApiError ? (err.body as { errors?: { message: string }[] }) : null;
      setError(body?.errors?.[0]?.message ?? "Couldn't set your password. Try again.");
      setBusy(false);
    }
  }

  const field =
    "h-12 w-full rounded-control border border-transparent bg-fill px-4 text-body outline-none focus:border-accent";

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <LogoMark className="size-12 rounded-[14px]" />
          <h1 className="text-title-1 font-bold">Set your password</h1>
          {email && <p className="text-body text-ink-2">for {email}</p>}
        </div>

        {state === "checking" && <p className="text-center text-body text-ink-2">Checking your link…</p>}

        {state === "invalid" && (
          <div className="glass rounded-card p-6 text-center">
            <p className="text-headline font-semibold">This link doesn&apos;t work anymore</p>
            <p className="mt-1 text-body text-ink-2">
              It may have expired or already been used. Ask your admin to resend your invite.
            </p>
          </div>
        )}

        {state === "valid" && (
          <form onSubmit={submit} noValidate className="glass flex flex-col gap-4 rounded-card p-6">
            <input type="email" value={email} autoComplete="username" readOnly hidden />
            <label className="flex flex-col gap-1.5 text-footnote font-semibold text-ink-2">
              New password
              <input type="password" value={password} autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)} className={field} />
              <span className="font-normal text-ink-3">At least 10 characters. A short phrase works well.</span>
            </label>
            <label className="flex flex-col gap-1.5 text-footnote font-semibold text-ink-2">
              Type it again
              <input type="password" value={confirm} autoComplete="new-password"
                onChange={(e) => setConfirm(e.target.value)} className={field} />
            </label>
            {error && <p role="alert" className="text-footnote text-danger">{error}</p>}
            <button type="submit" disabled={busy}
              className="press mt-1 h-12 rounded-full bg-accent text-body font-semibold text-on-accent disabled:opacity-60">
              {busy ? "Saving…" : "Set password and continue"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
