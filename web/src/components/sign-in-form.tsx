"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { requestPasswordReset, signIn, signOut, verifyCode } from "@/lib/auth";

type FieldErrors = { email?: string; password?: string };

/** Only same-site paths are followed after signing in (never "//elsewhere"). */
export function safeNext(next: string | null | undefined) {
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/today";
}

/**
 * Email and password, then the two-step code if the account has one. Used by the sign-in popup;
 * on success it opens `next` (default Today).
 */
export function SignInForm({ initialEmail = "", next }: { initialEmail?: string; next?: string | null }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [step, setStep] = useState<"password" | "code" | "forgot" | "sent">("password");
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);

  async function finish() {
    await queryClient.invalidateQueries();
    router.replace(safeNext(next));
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
    "h-11 w-full rounded-control border bg-fill px-4 text-body outline-none transition-colors focus:border-accent";
  const errorBox = formError && (
    <p role="alert" className="rounded-row bg-danger/10 px-4 py-3 text-footnote font-medium text-danger-ink">
      {formError}
    </p>
  );

  async function handleForgot(event: React.FormEvent) {
    event.preventDefault();
    if (!/^S+@S+.S+$/.test(email.trim())) {
      setFieldErrors({ email: "Enter the email you sign in with." });
      return;
    }
    setFieldErrors({});
    setFormError(null);
    setPending(true);
    const error = await requestPasswordReset(email.trim());
    setPending(false);
    if (error) return setFormError(error);
    setStep("sent");
  }

  if (step === "sent") {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-headline font-semibold">Check your email</p>
          <p className="mt-1 text-footnote text-ink-2">
            If {email.trim()} has an account, a link to choose a new password is on its way. It
            works once and expires in a few days. No email? Ask the college office: they can give
            you a reset link.
          </p>
        </div>
        <button type="button" onClick={() => setStep("password")}
          className="press h-11 rounded-full bg-fill-strong text-body font-semibold">
          Back to sign in
        </button>
      </div>
    );
  }

  if (step === "forgot") {
    return (
      <form onSubmit={handleForgot} noValidate className="flex flex-col gap-4">
        <div>
          <p className="text-headline font-semibold">Forgot your password?</p>
          <p className="mt-1 text-footnote text-ink-2">We&apos;ll email you a link to choose a new one.</p>
        </div>
        {errorBox}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="forgot-email" className="text-footnote font-semibold text-ink-2">
            Email
          </label>
          <input
            id="forgot-email"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(fieldErrors.email)}
            className={`${inputClass} ${fieldErrors.email ? "border-danger" : "border-transparent"}`}
          />
          {fieldErrors.email && <p className="text-footnote text-danger-ink">{fieldErrors.email}</p>}
        </div>
        <button type="submit" disabled={pending}
          className="press h-11 rounded-full bg-accent text-body font-semibold text-on-accent disabled:opacity-70">
          {pending ? "Sending…" : "Send reset link"}
        </button>
        <button type="button" onClick={() => { setStep("password"); setFormError(null); }}
          className="text-footnote font-semibold text-ink-2">
          Back to sign in
        </button>
      </form>
    );
  }

  if (step === "code") {
    return (
      <form onSubmit={handleCode} noValidate className="flex flex-col gap-4">
        <div>
          <p className="text-headline font-semibold">Two-step sign-in</p>
          <p className="mt-1 text-footnote text-ink-2">
            {recovery
              ? "Enter one of the recovery codes you saved. Each one works once."
              : "Open your authenticator app and enter the 6-digit code for CampusVerse."}
          </p>
        </div>
        {errorBox}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="signin-code" className="text-footnote font-semibold text-ink-2">
            {recovery ? "Recovery code" : "Code"}
          </label>
          <input
            id="signin-code"
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
          className="press h-11 rounded-full bg-accent text-body font-semibold text-on-accent disabled:opacity-70"
        >
          {pending ? "Checking…" : "Continue"}
        </button>
        <div className="flex flex-wrap justify-between gap-2 text-footnote font-semibold">
          <button
            type="button"
            onClick={() => {
              setRecovery((r) => !r);
              setCode("");
              setFormError(null);
            }}
            className="text-accent-ink"
          >
            {recovery ? "Use a code from my app" : "Lost your phone? Use a recovery code"}
          </button>
          <button type="button" onClick={startOver} className="text-ink-2">
            Start over
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {errorBox}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="signin-email" className="text-footnote font-semibold text-ink-2">
          Email
        </label>
        <input
          id="signin-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="name@university.edu"
          autoFocus={!initialEmail}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined }));
          }}
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={fieldErrors.email ? "signin-email-error" : undefined}
          className={`${inputClass} ${fieldErrors.email ? "border-danger" : "border-transparent"}`}
        />
        {fieldErrors.email && (
          <p id="signin-email-error" className="text-footnote text-danger-ink">
            {fieldErrors.email}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="signin-password" className="text-footnote font-semibold text-ink-2">
          Password
        </label>
        <input
          id="signin-password"
          type="password"
          autoComplete="current-password"
          autoFocus={Boolean(initialEmail)}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined }));
          }}
          aria-invalid={Boolean(fieldErrors.password)}
          aria-describedby={fieldErrors.password ? "signin-password-error" : undefined}
          className={`${inputClass} ${fieldErrors.password ? "border-danger" : "border-transparent"}`}
        />
        {fieldErrors.password && (
          <p id="signin-password-error" className="text-footnote text-danger-ink">
            {fieldErrors.password}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="press mt-1 h-11 rounded-full bg-accent text-body font-semibold text-on-accent disabled:opacity-70"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <button
        type="button"
        onClick={() => { setStep("forgot"); setFormError(null); setFieldErrors({}); }}
        className="self-center text-footnote font-semibold text-accent-ink"
      >
        Forgot password?
      </button>
    </form>
  );
}
