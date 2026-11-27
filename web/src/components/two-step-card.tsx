"use client";

import { useQueryClient } from "@tanstack/react-query";
import { PasswordInput } from "@/components/password-input";
import { useState } from "react";
import { encode } from "uqr";
import { ApiError } from "@/lib/api";
import {
  NeedsPassword,
  account,
  allauthError,
  confirmPassword,
  totpSetup,
  type TotpSetup,
} from "@/lib/auth";

const field =
  "h-11 w-full rounded-control border border-transparent bg-[var(--cv-bg)] px-3 text-body outline-none focus:border-accent";
const primary =
  "press h-11 rounded-full bg-accent px-5 text-body font-semibold text-on-accent disabled:opacity-60";
const secondary =
  "press h-11 rounded-full bg-fill-strong px-5 text-body font-semibold disabled:opacity-60";

/** Black on white whatever the theme: scanners need the contrast. */
function QrCode({ text }: { text: string }) {
  const { data } = encode(text, { ecc: "M", border: 2 });
  const size = data.length;
  let path = "";
  data.forEach((row, y) => row.forEach((dark, x) => {
    if (dark) path += `M${x} ${y}h1v1h-1z`;
  }));
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="QR code for your authenticator app"
      className="size-44 rounded-[14px] bg-white p-1" shapeRendering="crispEdges">
      <path d={path} fill="#000" />
    </svg>
  );
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `CampusVerse recovery codes\nEach code works once.\n\n${codes.join("\n")}\n`;
  return (
    <div className="flex flex-col gap-3 rounded-row bg-fill p-4">
      <p className="text-body font-semibold">Save your recovery codes</p>
      <p className="text-footnote text-ink-2">
        If you lose your phone, each of these lets you sign in once. Keep them somewhere safe, like a
        password manager. This is the only time they&apos;re shown together.
      </p>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-body sm:grid-cols-3">
        {codes.map((c) => <li key={c}>{c}</li>)}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondary} onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        }}>
          {copied ? "Copied" : "Copy"}
        </button>
        <a className={`${secondary} inline-flex items-center`} download="campusverse-recovery-codes.txt"
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`}>
          Download
        </a>
        <button type="button" className={`${primary} ml-auto`} onClick={onDone}>I&apos;ve saved them</button>
      </div>
    </div>
  );
}

export function TwoStepCard({ on }: { on: boolean }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"idle" | "setup" | "codes" | "confirm-off">("idle");
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A sensitive step waiting for the password to be confirmed.
  const [waiting, setWaiting] = useState<(() => Promise<void>) | null>(null);
  const [password, setPassword] = useState("");

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      if (err instanceof NeedsPassword) setWaiting(() => action);
      else setError(err instanceof ApiError ? allauthError(err, "That didn't work. Try again.") : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    const problem = await confirmPassword(password);
    if (problem) return setError(problem);
    const action = waiting;
    setWaiting(null);
    setPassword("");
    if (action) await run(action);
  }

  const refreshMe = () => queryClient.invalidateQueries({ queryKey: ["me"] });

  const start = () => run(async () => {
    const pending = await totpSetup();
    if (pending === null) return void (await refreshMe()); // already on
    setSetup(pending);
    setCode("");
    setMode("setup");
  });

  const activate = () => run(async () => {
    const clean = code.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(clean)) throw new ApiError(400, { errors: [{ message: "Enter the 6-digit code from your app." }] });
    await account("POST", "/account/authenticators/totp", { code: clean });
    const r = await account<{ data: { unused_codes: string[] } }>("GET", "/account/authenticators/recovery-codes");
    setCodes(r.data.unused_codes);
    setMode("codes");
  });

  const showCodes = (fresh: boolean) => run(async () => {
    const r = await account<{ data: { unused_codes: string[] } }>(
      fresh ? "POST" : "GET", "/account/authenticators/recovery-codes",
    );
    setCodes(r.data.unused_codes);
    setMode("codes");
  });

  const turnOff = () => run(async () => {
    await account("DELETE", "/account/authenticators/totp");
    setMode("idle");
    await refreshMe();
  });

  const secretGroups = setup?.secret.match(/.{1,4}/g)?.join(" ") ?? "";

  return (
    <section aria-labelledby="two-step-h" className="glass flex flex-col gap-4 rounded-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="two-step-h" className="flex items-center gap-2 text-headline font-semibold">
            Two-step sign-in
            <span className={`rounded-full px-2 py-0.5 text-caption font-semibold ${
              on ? "bg-success/12 text-success-ink" : "bg-fill-strong text-ink-2"
            }`}>
              {on ? "On" : "Off"}
            </span>
          </h2>
          <p className="text-footnote text-ink-2">
            {on
              ? "Signing in asks for a code from your authenticator app as well as your password."
              : "Protect your account with a code from an app like Google Authenticator, Microsoft Authenticator or 1Password."}
          </p>
        </div>
        {mode === "idle" && !waiting && (
          on ? (
            <div className="flex flex-wrap gap-2">
              <button className={secondary} disabled={busy} onClick={() => showCodes(false)}>Recovery codes</button>
              <button className={secondary} disabled={busy} onClick={() => setMode("confirm-off")}>Turn off</button>
            </div>
          ) : (
            <button className={primary} disabled={busy} onClick={start}>{busy ? "Starting…" : "Turn on"}</button>
          )
        )}
      </div>

      {waiting && (
        <form noValidate onSubmit={(e) => { e.preventDefault(); confirm(); }}
          className="flex flex-col gap-3 rounded-row bg-fill p-4">
          <label className="flex flex-col gap-1.5 text-footnote font-semibold text-ink-2">
            For your security, confirm your password first
            <PasswordInput autoComplete="current-password" autoFocus value={password}
              onChange={(e) => setPassword(e.target.value)} className={field} />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className={secondary} onClick={() => { setWaiting(null); setPassword(""); setError(null); }}>
              Cancel
            </button>
            <button type="submit" className={primary} disabled={!password}>Confirm</button>
          </div>
        </form>
      )}

      {mode === "setup" && setup && !waiting && (
        <form noValidate onSubmit={(e) => { e.preventDefault(); activate(); }}
          className="flex flex-col gap-4 rounded-row bg-fill p-4 sm:flex-row sm:items-start">
          <QrCode text={setup.totp_url} />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-body">
              <li>Scan the code with your authenticator app.</li>
              <li>Enter the 6-digit code it shows.</li>
            </ol>
            <p className="text-footnote text-ink-2">
              Can&apos;t scan? Enter this key instead:{" "}
              <span className="select-all break-all font-mono font-semibold text-ink">{secretGroups}</span>
            </p>
            <label className="flex flex-col gap-1.5 text-footnote font-semibold text-ink-2">
              Code from the app
              <input autoComplete="one-time-code" inputMode="numeric" maxLength={7} placeholder="123 456"
                value={code} onChange={(e) => setCode(e.target.value)}
                className={`${field} text-center text-headline font-semibold tracking-[0.3em] sm:w-48`} />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={secondary} onClick={() => { setMode("idle"); setError(null); }}>Cancel</button>
              <button type="submit" className={primary} disabled={busy}>{busy ? "Checking…" : "Turn on"}</button>
            </div>
          </div>
        </form>
      )}

      {mode === "codes" && !waiting && (
        <>
          <RecoveryCodes codes={codes} onDone={async () => { setMode("idle"); setCodes([]); await refreshMe(); }} />
          {on && (
            <button className="self-start text-footnote font-semibold text-accent-ink" disabled={busy}
              onClick={() => showCodes(true)}>
              Make new codes (the old ones stop working)
            </button>
          )}
        </>
      )}

      {mode === "confirm-off" && !waiting && (
        <div className="flex flex-col gap-3 rounded-row bg-fill p-4">
          <p className="text-body">
            Turn off two-step sign-in? Your account will be protected by your password only.
          </p>
          <div className="flex justify-end gap-2">
            <button className={secondary} onClick={() => setMode("idle")}>Keep it on</button>
            <button className="press h-11 rounded-full bg-danger px-5 text-body font-semibold text-white disabled:opacity-60"
              disabled={busy} onClick={turnOff}>
              {busy ? "Turning off…" : "Turn off"}
            </button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-footnote text-danger-ink">{error}</p>}
    </section>
  );
}
