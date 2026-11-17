"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DateTimeField, todayIso } from "@/components/date-picker";
import { ChevronLeftIcon } from "@/components/icons";
import { ApiError, apiFetch } from "@/lib/api";
import { toLocalInput } from "@/lib/format";
import { useAudiences, useReach } from "@/lib/queries";
import type { Audience, MyNotice } from "@/lib/types";
import { PageTitle } from "@/components/page-title";

type Errors = { title?: string; body?: string; targets?: string; publishAt?: string; expiresAt?: string };

function inHours(hours: number) {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + hours);
  return toLocalInput(d);
}

export default function NewNoticePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const audiences = useAudiences();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [important, setImportant] = useState(false);
  const [targets, setTargets] = useState<string[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState<"draft" | "publish" | null>(null);
  const [when, setWhen] = useState<"now" | "later">("now");
  const [publishAt, setPublishAt] = useState(() => inHours(18));
  const [expires, setExpires] = useState(false);
  const [expiresAt, setExpiresAt] = useState(() => inHours(24 * 7));
  const reach = useReach(targets);

  const groups = (audiences.data ?? []).reduce<Record<string, Audience[]>>((acc, a) => {
    (acc[a.group] ??= []).push(a);
    return acc;
  }, {});

  function toggle(key: string) {
    setTargets((t) => (t.includes(key) ? t.filter((k) => k !== key) : [...t, key]));
    setErrors((e) => ({ ...e, targets: undefined }));
  }

  async function save(publish: boolean) {
    const next: Errors = {};
    if (!title.trim()) next.title = "Give the notice a title.";
    if (!body.trim()) next.body = "Write the notice text.";
    if (publish && targets.length === 0) next.targets = "Choose who should see this notice.";
    const goesOut = publish && when === "later" ? new Date(publishAt) : new Date();
    if (publish && when === "later" && !(goesOut > new Date()))
      next.publishAt = "Pick a time in the future, or publish it now.";
    if (expires && !(new Date(expiresAt) > goesOut))
      next.expiresAt = "The take-down time has to be after it goes out.";
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;

    setPending(publish ? "publish" : "draft");
    try {
      await apiFetch<MyNotice>("/api/notices", {
        method: "POST",
        body: JSON.stringify({
          title,
          body,
          priority: important ? "important" : "normal",
          targets,
          publish,
          publish_at: publish && when === "later" ? new Date(publishAt).toISOString() : null,
          expires_at: expires ? new Date(expiresAt).toISOString() : null,
        }),
      });
      await queryClient.invalidateQueries({ queryKey: ["notices"] });
      router.push("/notices");
    } catch (err) {
      const detail =
        err instanceof ApiError && typeof err.body === "object" && err.body && "detail" in err.body
          ? String(err.body.detail)
          : "Couldn't save the notice. Check your connection and try again.";
      setFormError(detail);
      setPending(null);
    }
  }

  const inputClass =
    "w-full rounded-control border bg-fill px-4 text-body outline-none transition-colors focus:border-accent";

  if (audiences.isSuccess && audiences.data.length === 0) {
    return (
      <div className="glass mx-auto max-w-xl rounded-card p-6">
        <p className="text-headline font-semibold">You can&apos;t post notices yet</p>
        <p className="mt-1 text-body text-ink-2">
          Teachers post to the sections they teach. Ask your admin if you need to reach other groups.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header>
        <Link href="/notices" className="inline-flex items-center gap-1 text-footnote font-semibold text-accent-ink">
          <ChevronLeftIcon className="size-4" /> Notices
        </Link>
        <PageTitle className="mt-1 text-large-title font-bold" text="New notice" />
      </header>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save(true);
        }}
        className="glass flex flex-col gap-5 rounded-card p-6"
      >
        {formError && (
          <p role="alert" className="rounded-row bg-danger/10 px-4 py-3 text-footnote font-medium text-danger-ink">
            {formError}
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="title" className="text-footnote font-semibold text-ink-2">
            Title
          </label>
          <input
            id="title"
            value={title}
            maxLength={200}
            placeholder="Quiz 3 covers lists and stacks"
            onChange={(e) => {
              setTitle(e.target.value);
              if (errors.title) setErrors((x) => ({ ...x, title: undefined }));
            }}
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? "title-error" : undefined}
            className={`${inputClass} h-12 font-semibold ${errors.title ? "border-danger" : "border-transparent"}`}
          />
          {errors.title && (
            <p id="title-error" className="text-footnote text-danger-ink">
              {errors.title}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="body" className="text-footnote font-semibold text-ink-2">
            Message
          </label>
          <textarea
            id="body"
            value={body}
            rows={5}
            maxLength={5000}
            placeholder="Trees aren't in Quiz 3. Bring a pencil; it's on paper."
            onChange={(e) => {
              setBody(e.target.value);
              if (errors.body) setErrors((x) => ({ ...x, body: undefined }));
            }}
            aria-invalid={Boolean(errors.body)}
            aria-describedby={errors.body ? "body-error" : undefined}
            className={`${inputClass} resize-y py-3 ${errors.body ? "border-danger" : "border-transparent"}`}
          />
          {errors.body && (
            <p id="body-error" className="text-footnote text-danger-ink">
              {errors.body}
            </p>
          )}
        </div>

        <fieldset className="flex flex-col gap-2" aria-describedby="reach">
          <legend className="mb-2 text-footnote font-semibold text-ink-2">Who sees this</legend>
          {audiences.isPending && <p className="text-footnote text-ink-3">Loading audiences…</p>}
          {Object.entries(groups).map(([group, items]) => (
            <div key={group} className="flex flex-col gap-1.5">
              {Object.keys(groups).length > 1 && <p className="text-caption font-semibold text-ink-3">{group}</p>}
              <div className="flex flex-wrap gap-2">
                {items.map((a) => {
                  const on = targets.includes(a.key);
                  return (
                    <button
                      key={a.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(a.key)}
                      aria-label={`${a.label}${a.detail ? `, ${a.detail}` : ""}, ${a.reach} ${
                        a.reach === 1 ? "person" : "people"
                      }`}
                      className={`press h-9 rounded-full px-3.5 text-footnote font-semibold transition-colors ${
                        on ? "bg-accent text-on-accent" : "bg-fill-strong hover:bg-fill"
                      }`}
                    >
                      {on && <span aria-hidden="true">✓ </span>}
                      {a.label}
                      <span className={on ? "ml-1.5 opacity-80" : "ml-1.5 text-ink-3"}>{a.reach}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <p id="reach" className="mt-1 text-footnote text-ink-2" aria-live="polite">
            {targets.length === 0
              ? "Pick at least one audience. Only groups you're allowed to reach are listed."
              : reach.data
                ? `${reach.data.people} ${reach.data.people === 1 ? "person" : "people"} will see this.`
                : "Counting…"}
          </p>
          {errors.targets && <p className="text-footnote text-danger-ink">{errors.targets}</p>}
        </fieldset>

        <label className="flex items-center gap-3 text-body">
          <input
            type="checkbox"
            checked={important}
            onChange={(e) => setImportant(e.target.checked)}
            className="size-5 accent-[var(--cv-accent)]"
          />
          <span>
            Mark as important
            <span className="block text-footnote text-ink-2">Shown with a red label at the top of feeds.</span>
          </span>
        </label>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-footnote font-semibold text-ink-2">When to publish</legend>
          <div role="radiogroup" aria-label="When to publish" className="flex rounded-control bg-fill p-1 sm:w-1/2">
            {(["now", "later"] as const).map((w) => (
              <button key={w} type="button" role="radio" aria-checked={when === w} onClick={() => setWhen(w)}
                className={`h-9 flex-1 rounded-[9px] text-footnote font-semibold ${
                  when === w ? "bg-[var(--cv-bg)] shadow-sm" : "text-ink-2"
                }`}>
                {w === "now" ? "Now" : "Later"}
              </button>
            ))}
          </div>
          {when === "later" && (
            <label className="flex flex-col gap-1.5 text-footnote font-semibold text-ink-2 sm:w-2/3">
              Goes out on
              <DateTimeField value={publishAt} onChange={setPublishAt} label="Goes out on" min={todayIso()}
                className="h-11 w-full rounded-control bg-fill px-3 text-body font-normal text-ink" />
              <span className="font-normal">Only you see it until then. Nobody is notified early.</span>
              {errors.publishAt && <span className="font-normal text-danger-ink">{errors.publishAt}</span>}
            </label>
          )}
          <label className="flex items-center gap-3 text-body">
            <input type="checkbox" checked={expires} onChange={(e) => setExpires(e.target.checked)} />
            Take it down automatically
          </label>
          {expires && (
            <label className="flex flex-col gap-1.5 text-footnote font-semibold text-ink-2 sm:w-2/3">
              Remove from feeds on
              <DateTimeField value={expiresAt} onChange={setExpiresAt} label="Remove from feeds on" min={todayIso()}
                className="h-11 w-full rounded-control bg-fill px-3 text-body font-normal text-ink" />
              <span className="font-normal">Good for room changes and one-off reminders. You can still see it.</span>
              {errors.expiresAt && <span className="font-normal text-danger-ink">{errors.expiresAt}</span>}
            </label>
          )}
        </fieldset>

        <div className="flex flex-wrap justify-end gap-3 border-t border-divider pt-4">
          <button
            type="button"
            onClick={() => save(false)}
            disabled={pending !== null}
            className="press h-11 rounded-full bg-fill-strong px-5 text-body font-semibold disabled:opacity-60"
          >
            {pending === "draft" ? "Saving…" : "Save draft"}
          </button>
          <button
            type="submit"
            disabled={pending !== null}
            className="press h-11 rounded-full bg-accent px-6 text-body font-semibold text-on-accent disabled:opacity-60"
          >
            {pending === "publish"
              ? when === "later" ? "Scheduling…" : "Publishing…"
              : when === "later" ? "Schedule" : "Publish"}
          </button>
        </div>
      </form>
    </div>
  );
}
