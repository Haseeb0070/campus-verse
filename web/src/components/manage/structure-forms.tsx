"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ChipGroup } from "@/components/chip-group";
import { Select } from "@/components/select";
import { apiFetch, errorDetail } from "@/lib/api";
import { cohortsKey, structureKey, usePersonSearch } from "@/lib/structure";
import type { CohortRow, Structure, StructurePerson } from "@/lib/structure";

const field =
  "h-11 w-full rounded-control border border-transparent bg-[var(--cv-bg)] px-3 text-body outline-none focus:border-accent";
const label = "flex flex-col gap-1.5 text-footnote font-semibold text-ink-2";
const primary =
  "press h-11 rounded-full bg-accent px-5 text-body font-semibold text-on-accent disabled:opacity-60";
const quiet = "press h-10 rounded-full bg-fill-strong px-4 text-footnote font-semibold disabled:opacity-60";

function FormBox({ children, onSubmit, error }: {
  children: React.ReactNode; onSubmit: () => void; error: string | null;
}) {
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      className="flex flex-col gap-3 rounded-row bg-fill p-4">
      {children}
      {error && <p role="alert" className="text-footnote text-danger-ink">{error}</p>}
    </form>
  );
}

/** Finds teachers or students to add, leaving out the ones already there. */
export function PersonPicker({ kind, exclude, onPick, label }: {
  kind: "student" | "teacher"; exclude: Set<number>; onPick: (p: StructurePerson) => void; label: string;
}) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  const people = usePersonSearch(kind, debounced, true);
  const list = (people.data ?? []).filter((p) => !exclude.has(p.id));
  return (
    <div className="flex flex-col gap-2 rounded-row bg-fill p-3">
      <label className="flex flex-col gap-1.5 text-footnote font-semibold text-ink-2">
        {label}
        <input type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Name, email or ID" className={`${field} bg-[var(--cv-bg)]`} />
      </label>
      <ul className="flex max-h-64 flex-col overflow-y-auto">
        {list.map((p) => (
          <li key={p.id} className="flex items-center gap-3 rounded-row p-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-fill-strong text-caption font-semibold">{p.initials}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body font-semibold">{p.name}</span>
              <span className="block truncate text-footnote text-ink-2">{p.email}</span>
            </span>
            <button className="press rounded-full bg-accent px-3 py-1.5 text-footnote font-semibold text-on-accent" onClick={() => onPick(p)}>
              Add
            </button>
          </li>
        ))}
        {people.isSuccess && list.length === 0 && <li className="p-2 text-footnote text-ink-2">Nobody matches.</li>}
      </ul>
    </div>
  );
}

const SHIFTS: { value: "" | "morning" | "evening"; label: string }[] = [
  { value: "morning", label: "Morning" },
  { value: "evening", label: "Evening" },
  { value: "", label: "None" },
];

/** Adds a section, or (with `cohort`) changes one. */
export function CohortForm({ s, cohort, onDone }: { s: Structure; cohort?: CohortRow; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [programId, setProgramId] = useState(String(cohort?.program_id ?? s.programs[0]?.id ?? ""));
  const [start, setStart] = useState(String(cohort?.start_year ?? new Date().getFullYear()));
  const [end, setEnd] = useState(String(cohort?.end_year ?? new Date().getFullYear() + 4));
  const [shift, setShift] = useState<"" | "morning" | "evening">(cohort?.shift ?? "morning");
  const [name, setName] = useState(cohort?.name ?? "");
  const [code, setCode] = useState(cohort?.code ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const program = s.programs.find((p) => String(p.id) === programId);
  // A suggested code from the parts: "BSCS24-MA". Typed codes win.
  const suggested = `${program?.code ?? ""}${start.slice(2)}-${shift ? shift[0].toUpperCase() : ""}${name.replace(/\s+/g, "").toUpperCase()}`.slice(0, 16);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(cohort ? `/api/manage/sections/${cohort.id}` : "/api/manage/sections", {
        method: cohort ? "PUT" : "POST",
        body: JSON.stringify({
          program_id: programId ? Number(programId) : null, code: code.trim() || suggested, name, shift,
          start_year: start ? Number(start) : null, end_year: end ? Number(end) : null,
        }),
      });
      await queryClient.invalidateQueries({ queryKey: cohortsKey });
      await queryClient.invalidateQueries({ queryKey: structureKey });
      onDone();
    } catch (err) {
      setError(errorDetail(err, "Couldn't save the section."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormBox error={error} onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        <label className={label}>Program
          <Select value={programId} onChange={setProgramId} label="Program" placeholder="Choose a program" className={field}
            options={s.programs.map((p) => ({ value: String(p.id), label: p.name, detail: p.code }))} />
        </label>
        <label className={label}>Batch starts
          <input inputMode="numeric" maxLength={4} value={start} onChange={(e) => setStart(e.target.value.replace(/\D/g, ""))} placeholder="2024" className={field} />
        </label>
        <label className={label}>Batch ends
          <input inputMode="numeric" maxLength={4} value={end} onChange={(e) => setEnd(e.target.value.replace(/\D/g, ""))} placeholder="2028" className={field} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-[auto_1fr_1fr] sm:items-end">
        <span className={label}>Shift
          <ChipGroup label="Shift" value={shift} onChange={setShift} options={SHIFTS} />
        </span>
        <label className={label}>Name (optional)
          <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="A" className={field} />
        </label>
        <label className={label}>Short code
          <input value={code} maxLength={16} onChange={(e) => setCode(e.target.value)} placeholder={suggested} className={field} />
        </label>
      </div>
      <p className="text-footnote text-ink-2">
        The short code shows on timetables and chats (for example “CC-320 · {code.trim() || suggested}”).
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" className={quiet} onClick={onDone}>Cancel</button>
        <button type="submit" className={primary} disabled={busy || !programId}>{cohort ? "Save" : "Add section"}</button>
      </div>
    </FormBox>
  );
}
