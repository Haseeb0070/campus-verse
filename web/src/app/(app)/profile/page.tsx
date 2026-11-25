"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Select } from "@/components/select";
import { Switch } from "@/components/switch";
import { siteThemeKey } from "@/components/theme-provider";
import { TwoStepCard } from "@/components/two-step-card";
import { apiFetch, errorDetail } from "@/lib/api";
import { courseBg, relativeTime } from "@/lib/format";
import { useNotificationPreferences } from "@/lib/notifications";
import { playChime, setSoundOn, soundOn } from "@/lib/sound";
import type { NotificationPreference } from "@/lib/notifications";
import { changePassword, topicLabels, useMyCorrections } from "@/lib/profile";
import type { Correction, CorrectionTopic } from "@/lib/profile";
import { useMe } from "@/lib/queries";
import type { Me } from "@/lib/types";

const field =
  "h-11 w-full rounded-control border border-transparent bg-fill px-3 text-body outline-none focus:border-accent";
const label = "flex flex-col gap-1.5 text-footnote font-semibold text-ink-2";
const primary =
  "press h-11 rounded-full bg-accent px-5 text-body font-semibold text-on-accent disabled:opacity-60";

const kindLabels = { student: "Student", teacher: "Teacher", staff: "Staff" };

function NameCard({ me }: { me: Me }) {
  const queryClient = useQueryClient();
  const [preferred, setPreferred] = useState(me.preferred_name);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setStatus(null);
    try {
      const updated = await apiFetch<Me>("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ preferred_name: preferred }),
      });
      queryClient.setQueryData(["me"], updated);
      setStatus({ ok: true, text: "Saved." });
    } catch (err) {
      setStatus({ ok: false, text: errorDetail(err, "Couldn't save. Try again.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="name-h" className="glass flex flex-col gap-4 rounded-card p-5">
      <div>
        <h2 id="name-h" className="text-headline font-semibold">Your name</h2>
        <p className="text-footnote text-ink-2">
          Official name: {me.first_name} {me.last_name}. It stays on your records.
        </p>
      </div>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <label className={`${label} min-w-[14rem] flex-1`}>
          Name people see
          <input value={preferred} maxLength={60} onChange={(e) => setPreferred(e.target.value)}
            placeholder={me.first_name} className={field} />
        </label>
        <button type="submit" disabled={busy || preferred.trim() === me.preferred_name} className={primary}>
          {busy ? "Saving…" : "Save"}
        </button>
      </form>
      <p className="text-caption text-ink-3">
        Shown instead of your first name in chat, the feed and class lists. Leave it empty to use{" "}
        {me.first_name}.
      </p>
      {status && (
        <p role={status.ok ? "status" : "alert"} className={`text-footnote ${status.ok ? "text-success-ink" : "text-danger-ink"}`}>
          {status.text}
        </p>
      )}
    </section>
  );
}

/** Shown only when the institution lets people give the guide their own name. */
function GuideNameCard({ me }: { me: Me }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(me.guide_name);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(value: string) {
    setBusy(true);
    setStatus(null);
    try {
      await apiFetch("/api/me/guide-name", {
        method: "PUT",
        body: JSON.stringify({ guide_name: value }),
      });
      const tidy = value.split(/\s+/).filter(Boolean).join(" ");
      setName(tidy);
      queryClient.setQueryData<Me>(["me"], (m) => (m ? { ...m, guide_name: tidy } : m));
      await queryClient.invalidateQueries({ queryKey: siteThemeKey });
      setStatus({ ok: true, text: tidy ? `Your guide is now ${tidy}.` : `Back to ${me.guide_name_default}.` });
    } catch (err) {
      setStatus({ ok: false, text: errorDetail(err, "Couldn't save. Try again.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="guide-name-h" className="glass flex flex-col gap-4 rounded-card p-5">
      <div>
        <h2 id="guide-name-h" className="text-headline font-semibold">Your guide</h2>
        <p className="text-footnote text-ink-2">
          Give the little helper in the corner a name of your own. Only you see it.
        </p>
      </div>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save(name);
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <label className={`${label} min-w-[14rem] flex-1`}>
          Guide&apos;s name
          <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)}
            placeholder={me.guide_name_default} className={field} />
        </label>
        <button type="submit" disabled={busy || name.trim() === me.guide_name} className={primary}>
          {busy ? "Saving…" : "Save"}
        </button>
      </form>
      <p className="text-caption text-ink-3">
        Up to 24 characters. Leave it empty to use {me.guide_name_default}.
      </p>
      {status && (
        <p role={status.ok ? "status" : "alert"} className={`text-footnote ${status.ok ? "text-success-ink" : "text-danger-ink"}`}>
          {status.text}
        </p>
      )}
    </section>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!current || !next) return setStatus({ ok: false, text: "Fill in both passwords." });
    if (next.length < 8) return setStatus({ ok: false, text: "Use at least 8 characters." });
    if (next !== confirm) return setStatus({ ok: false, text: "The new passwords don't match." });
    setBusy(true);
    setStatus(null);
    const error = await changePassword(current, next);
    setBusy(false);
    if (error) return setStatus({ ok: false, text: error });
    setCurrent("");
    setNext("");
    setConfirm("");
    setStatus({ ok: true, text: "Password changed." });
  }

  return (
    <section aria-labelledby="password-h" className="glass flex flex-col gap-4 rounded-card p-5">
      <h2 id="password-h" className="text-headline font-semibold">Password</h2>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="grid gap-3 sm:grid-cols-3"
      >
        <label className={label}>
          Current password
          <input type="password" autoComplete="current-password" value={current}
            onChange={(e) => setCurrent(e.target.value)} className={field} />
        </label>
        <label className={label}>
          New password
          <input type="password" autoComplete="new-password" value={next}
            onChange={(e) => setNext(e.target.value)} className={field} />
        </label>
        <label className={label}>
          Confirm new password
          <input type="password" autoComplete="new-password" value={confirm}
            onChange={(e) => setConfirm(e.target.value)} className={field} />
        </label>
        <div className="flex items-center justify-end gap-3 sm:col-span-3">
          {status && (
            <p role={status.ok ? "status" : "alert"} className={`mr-auto text-footnote ${status.ok ? "text-success-ink" : "text-danger-ink"}`}>
              {status.text}
            </p>
          )}
          <button type="submit" disabled={busy} className={primary}>
            {busy ? "Changing…" : "Change password"}
          </button>
        </div>
      </form>
    </section>
  );
}

function NotificationsCard() {
  const queryClient = useQueryClient();
  const prefs = useNotificationPreferences();
  const [error, setError] = useState<string | null>(null);
  const queryKey = ["notifications", "preferences"];

  async function set(key: string, channel: "in_app" | "email", on: boolean) {
    const before = queryClient.getQueryData<NotificationPreference[]>(queryKey);
    queryClient.setQueryData<NotificationPreference[]>(queryKey, (list) =>
      list?.map((p) => (p.key === key ? { ...p, [channel]: on } : p)),
    );
    setError(null);
    try {
      const saved = await apiFetch<NotificationPreference[]>("/api/notifications/preferences", {
        method: "PATCH",
        body: JSON.stringify({ changes: { [key]: { [channel]: on } } }),
      });
      queryClient.setQueryData(queryKey, saved);
    } catch (err) {
      queryClient.setQueryData(queryKey, before);
      setError(errorDetail(err, "Couldn't save that. Try again."));
    }
  }

  return (
    <section id="notifications" aria-labelledby="notif-h" className="glass scroll-mt-6 rounded-card p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="notif-h" className="text-headline font-semibold">Notifications</h2>
          <p className="text-footnote text-ink-2">Choose what reaches you, and where. Changes save right away.</p>
        </div>
        <div aria-hidden="true" className="hidden gap-4 pr-1 text-caption font-semibold text-ink-2 sm:flex">
          <span className="w-11 text-center">In app</span>
          <span className="w-11 text-center">Email</span>
        </div>
      </div>
      {error && <p role="alert" className="mt-3 text-footnote text-danger-ink">{error}</p>}
      <ul className="mt-3 divide-y divide-[var(--cv-divider)]">
        {prefs.data?.map((p) => (
          <li key={p.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
            <span className="min-w-0 flex-1 basis-56">
              <span className="block text-body font-semibold">{p.label}</span>
              <span className="block text-footnote text-ink-2">{p.detail}</span>
            </span>
            <span className="flex items-center gap-4">
              <span className="flex flex-col items-center gap-1">
                <Switch checked={p.in_app} disabled={p.locked} label={`${p.label} in the app`}
                  onChange={(on) => set(p.key, "in_app", on)} />
                <span className="text-caption text-ink-2 sm:hidden">In app</span>
              </span>
              <span className="flex flex-col items-center gap-1">
                <Switch checked={p.email} label={`${p.label} by email`}
                  onChange={(on) => set(p.key, "email", on)} />
                <span className="text-caption text-ink-2 sm:hidden">Email</span>
              </span>
            </span>
          </li>
        ))}
      </ul>
      <SoundRow />
    </section>
  );
}

/** The chime for new notifications, on this device. */
function SoundRow() {
  const [on, setOn] = useState(true);
  useEffect(() => setOn(soundOn()), []);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-divider pt-3">
      <span className="min-w-0 flex-1 basis-56">
        <span className="block text-body font-semibold">Play a sound</span>
        <span className="block text-footnote text-ink-2">A soft chime when a notification arrives, on this device.</span>
      </span>
      <span className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => playChime()}
          disabled={!on}
          className="press rounded-full bg-fill-strong px-3 py-1.5 text-footnote font-semibold disabled:opacity-50"
        >
          Test
        </button>
        <Switch
          checked={on}
          label="Play a sound for notifications"
          onChange={(v) => {
            setSoundOn(v);
            setOn(v);
            if (v) playChime();
          }}
        />
      </span>
    </div>
  );
}

/** "Seen" in one-to-one chats. Off hides it both ways, as in most chat apps. */
function ReadReceiptsCard({ on }: { on: boolean }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  async function set(value: boolean) {
    setError(null);
    try {
      await apiFetch("/api/me/read-receipts", { method: "PUT", body: JSON.stringify({ read_receipts: value }) });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      await queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
    } catch (err) {
      setError(errorDetail(err, "Couldn't save. Try again."));
    }
  }
  return (
    <section aria-labelledby="receipts-h" className="glass flex flex-col gap-2 rounded-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="min-w-0 flex-1 basis-56">
          <h2 id="receipts-h" className="text-headline font-semibold">Show “Seen” in private chats</h2>
          <span className="block text-footnote text-ink-2">
            People you message one-to-one see when you&apos;ve read their messages, and you see when they&apos;ve read yours.
            Turn it off and neither of you sees it. Subject chats never show it.
          </span>
        </span>
        <Switch checked={on} label="Show Seen in private chats" onChange={set} />
      </div>
      {error && <p role="alert" className="text-footnote text-danger-ink">{error}</p>}
    </section>
  );
}

const statusChip: Record<Correction["status"], { text: string; cls: string }> = {
  open: { text: "Waiting", cls: "bg-fill-strong text-ink-2" },
  resolved: { text: "Fixed", cls: "bg-success/12 text-success-ink" },
  declined: { text: "Declined", cls: "bg-danger/12 text-danger-ink" },
};

function CorrectionsCard() {
  const queryClient = useQueryClient();
  const mine = useMyCorrections();
  const [topic, setTopic] = useState<CorrectionTopic>("name");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!details.trim()) return setError("Say what's wrong and what it should be.");
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/me/corrections", { method: "POST", body: JSON.stringify({ topic, details }) });
      setDetails("");
      setSent(true);
      await queryClient.invalidateQueries({ queryKey: ["corrections", "mine"] });
    } catch (err) {
      setError(errorDetail(err, "Couldn't send it. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="fix-h" className="glass flex flex-col gap-4 rounded-card p-5">
      <div>
        <h2 id="fix-h" className="text-headline font-semibold">Something wrong on your record?</h2>
        <p className="text-footnote text-ink-2">
          Your name, email and enrollment come from your institution. Tell an admin what to fix.
        </p>
      </div>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex flex-col gap-3"
      >
        <label className={`${label} sm:w-72`}>
          What needs fixing
          <Select value={topic} onChange={(v) => setTopic(v as CorrectionTopic)} label="What needs fixing"
            className={field}
            options={Object.entries(topicLabels).map(([value, text]) => ({ value, label: text }))} />
        </label>
        <label className={label}>
          Details
          <textarea value={details} rows={3} maxLength={1000} onChange={(e) => {
            setDetails(e.target.value);
            setSent(false);
          }}
            placeholder="What's wrong, and what it should be."
            className={`${field} h-auto resize-y py-3`} />
        </label>
        <div className="flex items-center justify-end gap-3">
          {error && <p role="alert" className="mr-auto text-footnote text-danger-ink">{error}</p>}
          {sent && <p role="status" className="mr-auto text-footnote text-success-ink">Sent. You&apos;ll get a notification when it&apos;s answered.</p>}
          <button type="submit" disabled={busy} className={primary}>{busy ? "Sending…" : "Send to admins"}</button>
        </div>
      </form>

      {(mine.data?.length ?? 0) > 0 && (
        <ul className="flex flex-col gap-2 border-t border-divider pt-4">
          {mine.data!.map((c) => (
            <li key={c.id} className="rounded-row bg-fill p-3">
              <p className="flex flex-wrap items-center gap-2 text-footnote">
                <span className="font-semibold">{c.topic_label}</span>
                <span className={`rounded-full px-2 py-0.5 text-caption font-semibold ${statusChip[c.status].cls}`}>
                  {statusChip[c.status].text}
                </span>
                <span className="text-ink-2">{relativeTime(c.created_at)}</span>
              </p>
              <p className="mt-1 whitespace-pre-wrap text-body">{c.details}</p>
              {c.response && (
                <p className="mt-2 border-l-2 border-divider pl-3 text-footnote text-ink-2">
                  <span className="font-semibold text-ink">Admin:</span> {c.response}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function ProfilePage() {
  const me = useMe().data;
  if (!me) return null;
  const initials = `${(me.preferred_name || me.first_name)[0] ?? ""}${me.last_name[0] ?? ""}` || me.email[0];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header className="flex items-center gap-4">
        <span className="grid size-16 shrink-0 place-items-center rounded-full bg-accent/15 text-title-2 font-bold text-accent-ink">
          {initials.toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-title-1 font-bold">{me.full_name}</h1>
          <p className="truncate text-body text-ink-2">
            {me.email} · {kindLabels[me.kind]}
            {me.institution && ` at ${me.institution.name}`}
          </p>
        </div>
      </header>

      <NameCard me={me} />
      {me.guide_rename && <GuideNameCard me={me} />}
      <PasswordCard />
      <TwoStepCard on={me.two_step} />
      <NotificationsCard />
      <ReadReceiptsCard on={me.read_receipts} />

      {me.sections.length > 0 && (
        <section aria-labelledby="courses-h" className="glass rounded-card p-3">
          <h2 id="courses-h" className="px-3 pt-2 pb-1 text-headline font-semibold">Your courses</h2>
          <ul>
            {me.sections.map((s) => (
              <li key={s.id} className="flex items-center gap-3 rounded-row p-3">
                <span className={`h-9 w-1 shrink-0 rounded-full ${courseBg[s.color]}`} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-semibold">{s.course_title}</span>
                  <span className="block text-footnote text-ink-2">
                    {s.course_code} · {s.code} · {s.term}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-fill-strong px-2.5 py-1 text-caption font-semibold text-ink-2">
                  {s.teaching ? "Teaching" : "Enrolled"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <CorrectionsCard />
    </div>
  );
}
