"use client";

import { ChipGroup } from "@/components/chip-group";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch, errorDetail } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { type ManagedPerson, roleLabel, useDepartments, usePeople } from "@/lib/manage";
import { useMe } from "@/lib/queries";
import { Select } from "@/components/select";
import { PageTitle } from "@/components/page-title";

const kinds = [
  { value: "", label: "Everyone" },
  { value: "student", label: "Students" },
  { value: "teacher", label: "Teachers" },
  { value: "staff", label: "Staff" },
];

const field =
  "h-11 w-full rounded-control border border-transparent bg-fill px-3 text-body outline-none focus:border-accent";

export default function PeoplePage() {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [inviting, setInviting] = useState(false);
  const people = usePeople(q.trim(), kind);

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-body font-semibold text-ink-2">Accounts, invites and roles</p>
          <PageTitle className="mt-1 text-large-title font-bold" text="People" />
        </div>
        <button
          onClick={() => setInviting((v) => !v)}
          aria-expanded={inviting}
          className="press h-11 rounded-full bg-accent px-5 text-body font-semibold text-on-accent"
        >
          Invite someone
        </button>
      </header>

      {inviting && <InviteForm onDone={() => setInviting(false)} />}

      <div className="flex flex-wrap items-center gap-3">
        <label className="min-w-[16rem] flex-1">
          <span className="sr-only">Search people</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or email"
            className={`${field} glass`}
          />
        </label>
        <ChipGroup label="Filter" value={kind} onChange={setKind} options={kinds} />
      </div>

      <section aria-label="People" className="glass rounded-card p-3">
        {people.isPending && <p className="p-3 text-body text-ink-2">Loading…</p>}
        {people.data?.length === 0 && <p className="p-3 text-body text-ink-2">No one matches.</p>}
        <ul className="flex flex-col">
          {people.data?.map((p) => (
            <PersonRow key={p.id} person={p} />
          ))}
        </ul>
      </section>
    </>
  );
}

function InviteForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [kind, setKind] = useState("student");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !first.trim()) return setError("Enter an email and a first name.");
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/manage/people", {
        method: "POST",
        body: JSON.stringify({ email, first_name: first, last_name: last, kind }),
      });
      await queryClient.invalidateQueries({ queryKey: ["manage"] });
      onDone();
    } catch (err) {
      setError(errorDetail(err, "Couldn't send the invite."));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="glass arrive flex flex-col gap-4 rounded-card p-6">
      <div>
        <h2 className="text-headline font-semibold">Invite someone</h2>
        <p className="text-footnote text-ink-2">
          They get an email with a link to set their password. Choosing &ldquo;teacher&rdquo; doesn&apos;t give them
          any sections or roles; assign those separately.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-footnote font-semibold text-ink-2">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field}
            placeholder="name@university.edu" autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1.5 text-footnote font-semibold text-ink-2">
          They are a
          <Select value={kind} onChange={setKind} label="They are a" className={field} options={[
            { value: "student", label: "Student" },
            { value: "teacher", label: "Teacher" },
            { value: "staff", label: "Staff member" },
          ]} />
        </label>
        <label className="flex flex-col gap-1.5 text-footnote font-semibold text-ink-2">
          First name
          <input value={first} onChange={(e) => setFirst(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1.5 text-footnote font-semibold text-ink-2">
          Last name
          <input value={last} onChange={(e) => setLast(e.target.value)} className={field} />
        </label>
      </div>
      {error && <p role="alert" className="text-footnote text-danger-ink">{error}</p>}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onDone} className="press h-11 rounded-full bg-fill-strong px-5 text-body font-semibold">
          Cancel
        </button>
        <button type="submit" disabled={busy}
          className="press h-11 rounded-full bg-accent px-5 text-body font-semibold text-on-accent disabled:opacity-60">
          {busy ? "Sending…" : "Send invite"}
        </button>
      </div>
    </form>
  );
}

function PersonRow({ person: p }: { person: ManagedPerson }) {
  const queryClient = useQueryClient();
  const me = useMe().data;
  const departments = useDepartments();
  const [mode, setMode] = useState<"idle" | "role" | "deactivate">("idle");
  const [role, setRole] = useState("department_coordinator");
  const [dept, setDept] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(path: string, init: RequestInit = { method: "POST" }, done?: string) {
    setError(null);
    try {
      await apiFetch(path, init);
      await queryClient.invalidateQueries({ queryKey: ["manage"] });
      setMode("idle");
      if (done) setNotice(done);
    } catch (err) {
      setError(errorDetail(err, "That didn't work. Try again."));
    }
  }

  const status = !p.is_active
    ? { text: "Deactivated", cls: "bg-danger/12 text-danger-ink" }
    : p.invited
      ? { text: "Invited", cls: "bg-warning/18 text-ink" }
      : null;

  return (
    <li className="border-b border-divider p-3 last:border-0">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-full text-footnote font-semibold ${
          p.is_active ? "bg-fill-strong" : "bg-fill text-ink-3"}`}>
          {p.initials}
        </span>
        <span className="min-w-[12rem] flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className={`text-body font-semibold ${p.is_active ? "" : "text-ink-3"}`}>{p.name}</span>
            <span className="rounded-full bg-fill-strong px-2 py-0.5 text-caption font-semibold capitalize">{p.kind}</span>
            {status && <span className={`rounded-full px-2 py-0.5 text-caption font-semibold ${status.cls}`}>{status.text}</span>}
            {p.roles.map((r) => (
              <span key={r.id} className="inline-flex items-center gap-1 rounded-full bg-accent/12 py-0.5 pr-1 pl-2 text-caption font-semibold text-accent-ink">
                {roleLabel[r.role] ?? r.role}
                {r.department && ` · ${r.department}`}
                <button
                  onClick={() => run(`/api/manage/roles/${r.id}`, { method: "DELETE" })}
                  aria-label={`Remove ${roleLabel[r.role] ?? r.role} role from ${p.name}`}
                  className="grid size-4 place-items-center rounded-full hover:bg-accent/20"
                >
                  ×
                </button>
              </span>
            ))}
          </span>
          <span className="block text-footnote text-ink-2">
            {p.email} · {p.sections} {p.sections === 1 ? "section" : "sections"} ·{" "}
            {p.last_login ? `last signed in ${relativeTime(p.last_login)}` : "never signed in"}
          </span>
        </span>
        <span className="flex flex-wrap gap-2 text-footnote font-semibold">
          {p.invited && p.is_active && (
            <button onClick={() => run(`/api/manage/people/${p.id}/resend-invite`, undefined, "Invite sent again.")}
              className="press rounded-full bg-fill-strong px-3 py-1.5">
              Resend invite
            </button>
          )}
          <button onClick={() => setMode(mode === "role" ? "idle" : "role")} aria-expanded={mode === "role"}
            className="press rounded-full bg-fill-strong px-3 py-1.5">
            Add role
          </button>
          {p.id !== me?.id &&
            (p.is_active ? (
              <button onClick={() => setMode("deactivate")} className="press rounded-full px-3 py-1.5 text-danger-ink hover:bg-danger/10">
                Deactivate
              </button>
            ) : (
              <button onClick={() => run(`/api/manage/people/${p.id}/reactivate`)} className="press rounded-full bg-fill-strong px-3 py-1.5">
                Reactivate
              </button>
            ))}
        </span>
      </div>

      {mode === "deactivate" && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-row bg-danger/8 p-3 text-footnote">
          <span className="flex-1">
            {p.name} will be signed out and can&apos;t sign in until reactivated. Their work and messages stay.
          </span>
          <button onClick={() => run(`/api/manage/people/${p.id}/deactivate`)}
            className="press rounded-full bg-danger px-3 py-1.5 font-semibold text-on-accent">
            Deactivate
          </button>
          <button onClick={() => setMode("idle")} className="font-semibold">Cancel</button>
        </div>
      )}

      {mode === "role" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(`/api/manage/people/${p.id}/roles`, {
              method: "POST",
              body: JSON.stringify({ role, department_id: dept ? Number(dept) : null }),
            });
          }}
          className="mt-3 flex flex-wrap items-end gap-3 rounded-row bg-fill p-3"
        >
          <label className="flex flex-col gap-1 text-footnote font-semibold text-ink-2">
            Role
            <Select value={role} onChange={setRole} label="Role" className={`${field} w-56 bg-[var(--cv-bg)]`} options={[
              { value: "department_coordinator", label: "Department coordinator" },
              { value: "moderator", label: "Moderator" },
              { value: "institution_admin", label: "Institution admin" },
            ]} />
          </label>
          {role === "department_coordinator" && (
            <label className="flex flex-col gap-1 text-footnote font-semibold text-ink-2">
              Department
              <Select value={dept} onChange={setDept} label="Department" placeholder="Choose a department"
                className={`${field} w-56 bg-[var(--cv-bg)]`}
                options={(departments.data ?? []).map((d) => ({ value: String(d.id), label: d.name }))} />
            </label>
          )}
          <button type="submit" className="press h-11 rounded-full bg-accent px-5 text-body font-semibold text-on-accent">
            Grant
          </button>
        </form>
      )}

      {error && <p role="alert" className="mt-2 text-footnote text-danger-ink">{error}</p>}
      {notice && <p role="status" className="mt-2 text-footnote text-success-ink">{notice}</p>}
    </li>
  );
}
