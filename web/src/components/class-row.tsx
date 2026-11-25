"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { CheckIcon } from "@/components/icons";
import { courseBg, formatDay, formatTime } from "@/lib/format";
import type { Occurrence, OccurrenceStatus } from "@/lib/types";

const statusChip: Partial<Record<OccurrenceStatus, { label: string; className: string }>> = {
  cancelled: { label: "Cancelled", className: "bg-danger/12 text-danger-ink" },
  moved: { label: "Moved", className: "bg-warning/18 text-ink" },
  rescheduled: { label: "Rescheduled", className: "bg-accent/12 text-accent-ink" },
  room_changed: { label: "Room changed", className: "bg-warning/18 text-ink" },
};

const kindLabel = { lecture: "Lecture", lab: "Lab", tutorial: "Tutorial" };

export function ClassRow({
  occ,
  timeZone,
  highlight = false,
  onManage,
  attendance = false,
  past = false,
}: {
  occ: Occurrence;
  timeZone?: string;
  highlight?: boolean;
  /** The class has already ended: dim it and mark it done. */
  past?: boolean;
  /** Offer "Attendance" on the section's classes that have started (when it's switched on). */
  attendance?: boolean;
  /** Shown only for classes the viewer may change (teachers of the section, admins). */
  onManage?: (occ: Occurrence) => void;
}) {
  const off = occ.status === "cancelled" || occ.status === "moved";
  const chip = statusChip[occ.status] ?? (past ? { label: "Done", className: "bg-fill-strong text-ink-2" } : undefined);
  const faded = off || past;
  // Draw the Done check only when the class ends while the page is open, not on every load.
  const wasPast = useRef(past);
  const justEnded = past && !wasPast.current;
  useEffect(() => {
    wasPast.current = past;
  });
  const where = occ.mode === "online" ? "Online" : occ.room || "Room to be confirmed";

  return (
    <li
      title={occ.source && occ.synced_at ? `From ${occ.source}, synced ${new Date(occ.synced_at).toLocaleString()}` : undefined}
      className={`flex gap-3 rounded-row p-2.5 ${highlight ? "bg-fill-strong" : ""}`}
      aria-current={highlight ? "true" : undefined}
    >
      <span
        className={`w-12 shrink-0 pt-0.5 text-footnote font-semibold tabular-nums ${
          faded ? "text-ink-3" : "text-ink-2"
        }`}
      >
        {formatTime(occ.starts_at, timeZone)}
      </span>
      <span
        className={`w-1 shrink-0 rounded-full ${courseBg[occ.color]} ${faded ? "opacity-40" : ""}`}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className={`text-body font-semibold ${off ? "text-ink-2 line-through" : past ? "text-ink-2" : ""}`}>
            {occ.course_title}
          </span>
          {chip && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold ${chip.className}`}>
              {past && !statusChip[occ.status] && (
                <CheckIcon className={`size-3 text-success-ink ${justEnded ? "draw" : ""}`} />
              )}
              {chip.label}
            </span>
          )}
        </span>
        <span className="block text-footnote text-ink-2">
          {occ.course_code} · {occ.section_code} · {kindLabel[occ.kind]} · {where} ·{" "}
          {formatTime(occ.starts_at, timeZone)}–{formatTime(occ.ends_at, timeZone)}
        </span>
        {occ.moved_to && (
          <span className="block text-footnote font-medium text-ink">
            Moved to {formatDay(occ.moved_to.slice(0, 10), { month: "short" })} at{" "}
            {formatTime(occ.moved_to, timeZone)}
          </span>
        )}
        {occ.moved_from && (
          <span className="block text-footnote font-medium text-ink">
            Moved from {formatDay(occ.moved_from, { month: "short" })}
          </span>
        )}
        {occ.note && <span className="block text-footnote text-ink-3">{occ.note}</span>}
      </span>
      {occ.mode === "online" && occ.online_url && !off && (
        <a
          href={occ.online_url}
          target="_blank"
          rel="noreferrer"
          className="press self-center rounded-full bg-fill-strong px-3 py-1.5 text-footnote font-semibold"
        >
          Join
        </a>
      )}
      {attendance && (occ.can_manage || occ.rep_role) && !off && new Date(occ.starts_at).getTime() <= Date.now() && (
        <Link
          href={`/attendance?section=${occ.section_id}&date=${occ.date}&meeting=${occ.meeting_id}`}
          className="press self-center rounded-full bg-fill-strong px-3 py-1.5 text-footnote font-semibold"
        >
          Attendance
        </Link>
      )}
      {onManage && (occ.can_manage || occ.rep_role) && (
        <button
          onClick={() => onManage(occ)}
          aria-label={`Change ${occ.course_title} ${occ.section_code} on ${occ.date}`}
          className="press self-center rounded-full bg-fill-strong px-3 py-1.5 text-footnote font-semibold"
        >
          {occ.can_manage ? "Change" : "Cancel or shift"}
        </button>
      )}
    </li>
  );
}
