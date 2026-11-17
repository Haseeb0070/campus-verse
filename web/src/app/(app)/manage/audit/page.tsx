"use client";

import { ChipGroup } from "@/components/chip-group";
import { useState } from "react";
import { formatDateTime } from "@/lib/format";
import { useAudit } from "@/lib/manage";
import { useMe } from "@/lib/queries";
import { PageTitle } from "@/components/page-title";

const filters = [
  { value: "", label: "Everything" },
  { value: "person.", label: "People" },
  { value: "role.", label: "Roles" },
  { value: "grade", label: "Grades" },
  { value: "schedule.", label: "Timetable" },
  { value: "import.", label: "Imports" },
  { value: "notice.", label: "Notices" },
  { value: "chat.", label: "Moderation" },
];

function describe(changes: Record<string, unknown>) {
  return Object.entries(changes)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(" → ") : typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

export default function AuditPage() {
  const tz = useMe().data?.institution?.timezone;
  const [action, setAction] = useState("");
  const entries = useAudit(action);

  return (
    <>
      <header>
        <p className="text-body font-semibold text-ink-2">Append-only: entries can&apos;t be edited or deleted</p>
        <PageTitle className="mt-1 text-large-title font-bold" text="Audit log" />
      </header>

      <ChipGroup label="Filter" className="self-start" value={action} onChange={setAction}
        options={filters} />

      <section aria-label="Entries" className="glass rounded-card p-4">
        {entries.data?.length === 0 && <p className="p-2 text-body text-ink-2">No entries.</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-footnote">
            <thead className="text-caption text-ink-2">
              <tr>
                {["When", "Who", "What", "Record", "Details"].map((h) => (
                  <th key={h} scope="col" className="px-2 py-2 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.data?.map((e) => (
                <tr key={e.id} className="border-t border-divider align-top">
                  <td className="whitespace-nowrap px-2 py-2.5 text-ink-2 tabular-nums">{formatDateTime(e.created_at, tz)}</td>
                  <td className="px-2 py-2.5 font-semibold">{e.actor ?? "System"}</td>
                  <td className="px-2 py-2.5"><code className="rounded bg-fill px-1.5 py-0.5">{e.action}</code></td>
                  <td className="px-2 py-2.5 text-ink-2">{e.target_type.split(".").pop()} {e.target_id}</td>
                  <td className="px-2 py-2.5 text-ink-2">{describe(e.changes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
