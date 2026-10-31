import { relativeTime } from "@/lib/format";
import type { Assignment } from "@/lib/types";

const tone = {
  good: "bg-success/15 text-ink",
  warn: "bg-warning/18 text-ink",
  bad: "bg-danger/12 text-danger",
  info: "bg-accent/12 text-accent-ink",
  muted: "bg-fill-strong text-ink-2",
};

/** One short status for the viewer: what a student needs to know, or a teacher's progress. */
export function assignmentStatus(a: Assignment): { label: string; tone: keyof typeof tone } {
  if (a.can_manage) {
    if (a.status === "draft") return { label: "Draft", tone: "muted" };
    if (a.grades_released) return { label: "Grades released", tone: "good" };
    return { label: `${a.submitted_count ?? 0}/${a.student_count ?? 0} submitted`, tone: "info" };
  }
  if (a.my_grade) return { label: `Graded ${Number(a.my_grade.points)}/${a.max_points}`, tone: "good" };
  if (a.my_attempts) return { label: "Submitted", tone: "good" };
  if (a.window === "closed") return { label: "Missed", tone: "bad" };
  if (a.window === "late") return { label: "Overdue, late work accepted", tone: "warn" };
  const hoursLeft = (new Date(a.due_at).getTime() - Date.now()) / 3_600_000;
  return { label: `Due ${relativeTime(a.due_at)}`, tone: hoursLeft < 24 ? "warn" : "info" };
}

export function AssignmentStatusChip({ assignment }: { assignment: Assignment }) {
  const s = assignmentStatus(assignment);
  return (
    <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-caption font-semibold ${tone[s.tone]}`}>
      {s.label}
    </span>
  );
}
