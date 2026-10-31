"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { LogoMark } from "@/components/icons";
import { signIn, signOut, verifyCode } from "@/lib/auth";

type FieldErrors = { email?: string; password?: string };

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [step, setStep] = useState<"password" | "code">("password");
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);

  async function finish() {
    await queryClient.invalidateQueries();
    const next = params.get("next");
    router.replace(next?.startsWith("/") && !next.startsWith("//") ? next : "/today");
  }

  async function handleCode(event: React.FormEvent) {
    event.preventDefault();
    const clean = code.replace(/\s+/g, "");
    if (!recovery && !/^\d{6}$/.test(clean)) return setFormError("Enter the 6-digit code from your app.");
    if (recovery && clean.length < 6) return setFormError("Enter one of your recovery codes.");
    setFormError(null);
    setPending(true);
    const error = await verifyCode(clean);
    if (error) {
      setFormError(error);
      setPending(false);
      return;
    }
    await finish();
  }

  async function startOver() {
    await signOut().catch(() => undefined); // drop the half-finished sign-in
    setStep("password");
    setCode("");
    setRecovery(false);
    setFormError(null);
    setPassword("");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const errors: FieldErrors = {};
    if (!email.trim()) errors.email = "Enter your email.";
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) errors.email = "Enter a full email address.";
    if (!password) errors.password = "Enter your password.";
    setFieldErrors(errors);
    setFormError(null);
    if (errors.email || errors.password) return;

    setPending(true);
    const result = await signIn(email.trim(), password);
    if (!result.ok) {
      setPending(false);
      if ("needsCode" in result) {
        setStep("code");
        return;
      }
      setFormError(result.error);
      return;
    }
    await finish();
  }

  const inputClass =
    "h-12 w-full rounded-control border bg-fill px-4 text-body outline-none transition-colors focus:border-accent";

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <LogoMark className="size-12 rounded-[14px]" />
          <h1 className="text-title-1 font-bold">Sign in to CampusVerse</h1>
          <p className="text-body text-ink-2">Use the email your institution gave you.</p>
        </div>

        {step === "code" ? (
          <form onSubmit={handleCode} noValidate className="glass flex flex-col gap-4 rounded-card p-6">
            <div>
              <h2 className="text-headline font-semibold">Two-step sign-in</h2>
              <p className="mt-1 text-footnote text-ink-2">
                {recovery
                  ? "Enter one of the recovery codes you saved. Each one works once."
                  : "Open your authenticator app and enter the 6-digit code for CampusVerse."}
              </p>
            </div>
            {formError && (
              <p role="alert" className="rounded-row bg-danger/10 px-4 py-3 text-footnote font-medium text-danger-ink">
                {formError}
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="code" className="text-footnote font-semibold text-ink-2">
                {recovery ? "Recovery code" : "Code"}
              </label>
              <input
                id="code"
                key={recovery ? "recovery" : "totp"}
                autoFocus
                autoComplete="one-time-code"
                inputMode={recovery ? "text" : "numeric"}
                maxLength={recovery ? 32 : 7}
                placeholder={recovery ? "abcd1234" : "123 456"}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={`${inputClass} border-transparent text-center text-title-2 font-semibold tracking-[0.3em]`}
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="press mt-2 h-12 rounded-full bg-accent text-body font-semibold text-on-accent disabled:opacity-70"
            >
              {pending ? "Checking…" : "Continue"}
            </button>
            <div className="flex flex-wrap justify-between gap-2 text-footnote font-semibold">
              <button type="button" onClick={() => { setRecovery((r) => !r); setCode(""); setFormError(null); }}
                className="text-accent-ink">
                {recovery ? "Use a code from my app" : "Lost your phone? Use a recovery code"}
              </button>
              <button type="button" onClick={startOver} className="text-ink-2">
                Start over
              </button>
            </div>
          </form>
        ) : (
        <form onSubmit={handleSubmit} noValidate className="glass flex flex-col gap-4 rounded-card p-6">
          {formError && (
            <p role="alert" className="rounded-row bg-danger/10 px-4 py-3 text-footnote font-medium text-danger-ink">
              {formError}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-footnote font-semibold text-ink-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="name@university.edu"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined }));
              }}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
              className={`${inputClass} ${fieldErrors.email ? "border-danger" : "border-transparent"}`}
            />
            {fieldErrors.email && (
              <p id="email-error" className="text-footnote text-danger-ink">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-footnote font-semibold text-ink-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined }));
              }}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? "password-error" : undefined}
              className={`${inputClass} ${fieldErrors.password ? "border-danger" : "border-transparent"}`}
            />
            {fieldErrors.password && (
              <p id="password-error" className="text-footnote text-danger-ink">
                {fieldErrors.password}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={pending}
            className="press mt-2 h-12 rounded-full bg-accent text-body font-semibold text-on-accent disabled:opacity-70"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
        )}

        <p className="mt-5 text-center text-footnote text-ink-2">
          Your institution creates accounts. If you don&apos;t have one, ask your admin.
        </p>
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
