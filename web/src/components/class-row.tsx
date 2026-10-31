import { courseBg, formatDay, formatTime } from "@/lib/format";
import type { Occurrence, OccurrenceStatus } from "@/lib/types";

const statusChip: Partial<Record<OccurrenceStatus, { label: string; className: string }>> = {
  cancelled: { label: "Cancelled", className: "bg-danger/12 text-danger" },
  moved: { label: "Moved", className: "bg-warning/18 text-ink" },
  rescheduled: { label: "Rescheduled", className: "bg-accent/12 text-accent-ink" },
  room_changed: { label: "Room changed", className: "bg-warning/18 text-ink" },
};

const kindLabel = { lecture: "Lecture", lab: "Lab", tutorial: "Tutorial" };

export function ClassRow({
  occ,
  timeZone,
  highlight = false,
}: {
  occ: Occurrence;
  timeZone?: string;
  highlight?: boolean;
}) {
  const chip = statusChip[occ.status];
  const off = occ.status === "cancelled" || occ.status === "moved";
  const where = occ.mode === "online" ? "Online" : occ.room || "Room to be confirmed";

  return (
    <li
      className={`flex gap-3 rounded-row p-2.5 ${highlight ? "bg-fill-strong" : ""}`}
      aria-current={highlight ? "true" : undefined}
    >
      <span
        className={`w-12 shrink-0 pt-0.5 text-footnote font-semibold tabular-nums ${
          off ? "text-ink-3" : "text-ink-2"
        }`}
      >
        {formatTime(occ.starts_at, timeZone)}
      </span>
      <span
        className={`w-1 shrink-0 rounded-full ${courseBg[occ.color]} ${off ? "opacity-40" : ""}`}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className={`text-body font-semibold ${off ? "text-ink-2 line-through" : ""}`}>
            {occ.course_title}
          </span>
          {chip && (
            <span className={`rounded-full px-2 py-0.5 text-caption font-semibold ${chip.className}`}>
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
    </li>
  );
}
