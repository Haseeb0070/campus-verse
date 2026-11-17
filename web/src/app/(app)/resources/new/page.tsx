"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronLeftIcon } from "@/components/icons";
import { apiFetch, errorDetail } from "@/lib/api";
import { fileSize } from "@/lib/format";
import { kindLabels, useShareOptions } from "@/lib/resources";
import type { Resource, ResourceKind } from "@/lib/resources";
import { Select } from "@/components/select";
import { PageTitle } from "@/components/page-title";

export default function ShareResourcePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const options = useShareOptions();
  const courses = options.data?.courses ?? [];
  const [courseId, setCourseId] = useState("");
  const [picked, setPicked] = useState<string[] | null>(null); // null: every section, by default
  const [kind, setKind] = useState<ResourceKind>("slides");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState<"file" | "link">("file");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const course =
    courses.find((c) => String(c.offering_id) === courseId) ??
    (courses.length === 1 ? courses[0] : undefined);
  const allKeys = course ? course.sections.map((s) => s.key) : [];
  const wholeKey = course ? `offering:${course.offering_id}` : "";
  const targets = picked ?? allKeys;

  function toggle(key: string) {
    // The whole course stands in for every section (including ones added later).
    if (key === wholeKey) setPicked(targets.includes(wholeKey) ? allKeys : [wholeKey]);
    else setPicked(targets.includes(key) ? targets.filter((k) => k !== key) : [...targets, key]);
  }

  async function share() {
    const e: Record<string, string> = {};
    const max = options.data?.max_mb ?? 20;
    if (!course) e.course = "Choose a course.";
    if (course && targets.length === 0) e.targets = "Choose at least one section.";
    if (!title.trim()) e.title = "Give the resource a title.";
    if (source === "file" && !file) e.file = "Choose a file.";
    if (source === "file" && file && file.size > max * 1024 * 1024)
      e.file = `Files can be up to ${max} MB.`;
    if (source === "link" && !/^https?:\/\/\S+\.\S+/.test(url.trim()))
      e.url = "Paste the full address, starting with https://.";
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length || !course) return;

    const form = new FormData();
    form.append("offering_id", String(course.offering_id));
    form.append("title", title);
    form.append("kind", kind);
    form.append("description", description);
    targets.forEach((t) => form.append("targets", t));
    if (source === "file" && file) form.append("file", file);
    else form.append("url", url.trim());

    setBusy(true);
    try {
      const created = await apiFetch<Resource>("/api/resources", { method: "POST", body: form });
      await queryClient.invalidateQueries({ queryKey: ["resources"] });
      router.push(`/resources/${created.id}`);
    } catch (err) {
      setFormError(errorDetail(err, "Couldn't share it. Try again."));
      setBusy(false);
    }
  }

  const field =
    "h-11 w-full rounded-control border border-transparent bg-fill px-3 text-body outline-none focus:border-accent";
  const label = "flex flex-col gap-1.5 text-footnote font-semibold text-ink-2";
  const err = (k: string) =>
    errors[k] && <span className="text-footnote font-normal text-danger-ink">{errors[k]}</span>;
  const segment = (on: boolean) =>
    `h-9 flex-1 rounded-[9px] px-2 text-footnote font-semibold ${on ? "bg-[var(--cv-bg)] shadow-sm" : "text-ink-2"}`;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header>
        <Link href="/resources" className="inline-flex items-center gap-1 text-footnote font-semibold text-accent-ink">
          <ChevronLeftIcon className="size-4" /> Resources
        </Link>
        <PageTitle className="mt-1 text-large-title font-bold" text="Share a resource" />
      </header>

      {options.isSuccess && courses.length === 0 ? (
        <div className="glass rounded-card p-6">
          <p className="text-headline font-semibold">No courses to share with</p>
          <p className="mt-1 text-body text-ink-2">You can share material with sections you teach.</p>
        </div>
      ) : (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            share();
          }}
          className="glass flex flex-col gap-5 rounded-card p-6"
        >
          {formError && (
            <p role="alert" className="rounded-row bg-danger/10 px-4 py-3 text-footnote font-medium text-danger-ink">
              {formError}
            </p>
          )}

          <label className={label}>
            Course
            <Select
              value={course ? String(course.offering_id) : ""}
              onChange={(v) => {
                setCourseId(v);
                setPicked(null);
              }}
              label="Course"
              placeholder="Choose a course"
              className={field}
              options={courses.map((c) => ({
                value: String(c.offering_id), label: `${c.course_code} · ${c.course_title}`, detail: c.term,
              }))}
            />
            {err("course")}
          </label>

          {course && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-footnote font-semibold text-ink-2">Who can see it</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {course.whole_course && (
                  <label className="flex items-center gap-2.5 text-body">
                    <input type="checkbox" checked={targets.includes(wholeKey)} onChange={() => toggle(wholeKey)}
                      className="size-5" />
                    Every {course.course_code} section
                  </label>
                )}
                {course.sections.map((s) => (
                  <label key={s.key} className="flex items-center gap-2.5 text-body">
                    <input type="checkbox" checked={targets.includes(s.key) || targets.includes(wholeKey)}
                      disabled={targets.includes(wholeKey)} onChange={() => toggle(s.key)} className="size-5" />
                    Section {s.code}
                    <span className="text-ink-2">· {s.reach} {s.reach === 1 ? "person" : "people"}</span>
                  </label>
                ))}
              </div>
              {err("targets")}
            </fieldset>
          )}

          <fieldset>
            <legend className="mb-1.5 text-footnote font-semibold text-ink-2">Type</legend>
            <div role="radiogroup" className="flex flex-wrap rounded-control bg-fill p-1">
              {(Object.keys(kindLabels) as ResourceKind[]).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
                  className={segment(kind === k)}>
                  {kindLabels[k]}
                </button>
              ))}
            </div>
          </fieldset>

          <label className={label}>
            Title
            <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)}
              placeholder="Week 5: Binary search trees" className={`${field} font-semibold`} />
            {err("title")}
          </label>

          <label className={label}>
            Description (optional)
            <textarea value={description} rows={3} maxLength={2000} onChange={(e) => setDescription(e.target.value)}
              placeholder="What it covers, or what to read before class."
              className={`${field} h-auto resize-y py-3`} />
          </label>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1.5 text-footnote font-semibold text-ink-2">Share</legend>
            <div role="radiogroup" className="flex rounded-control bg-fill p-1 sm:w-1/2">
              <button type="button" role="radio" aria-checked={source === "file"} onClick={() => setSource("file")}
                className={segment(source === "file")}>
                A file
              </button>
              <button type="button" role="radio" aria-checked={source === "link"} onClick={() => setSource("link")}
                className={segment(source === "link")}>
                A link
              </button>
            </div>
            {source === "file" ? (
              <label className={label}>
                <span className="sr-only">File</span>
                <input type="file" accept={options.data?.accept}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="text-body file:mr-3 file:h-10 file:rounded-full file:border-0 file:bg-fill-strong file:px-4 file:font-semibold" />
                <span className="font-normal text-ink-2">
                  {file
                    ? `${file.name} (${fileSize(file.size)})`
                    : `PDF, slides, documents, images or code, up to ${options.data?.max_mb ?? 20} MB.`}
                </span>
                {err("file")}
              </label>
            ) : (
              <label className={label}>
                <span className="sr-only">Link</span>
                <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://" className={field} />
                {err("url")}
              </label>
            )}
          </fieldset>

          <div className="flex justify-end border-t border-divider pt-4">
            <button type="submit" disabled={busy || options.isPending}
              className="press h-11 rounded-full bg-accent px-6 text-body font-semibold text-on-accent disabled:opacity-60">
              {busy ? "Sharing…" : "Share"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
