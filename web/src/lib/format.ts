import type { CourseColor } from "./types";

/** Literal class names so Tailwind can see them. */
export const courseBg: Record<CourseColor, string> = {
  lagoon: "bg-course-lagoon",
  tangerine: "bg-course-tangerine",
  orchid: "bg-course-orchid",
  rose: "bg-course-rose",
  sky: "bg-course-sky",
  lime: "bg-course-lime",
  gold: "bg-course-gold",
  slate: "bg-course-slate",
};

export function formatTime(iso: string, timeZone?: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(new Date(iso));
}

export function formatDay(isoDate: string, options: Intl.DateTimeFormatOptions = {}) {
  // Plain dates ("2026-11-05") are calendar days, not instants: read them as UTC noon.
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    ...options,
  }).format(new Date(`${isoDate}T12:00:00Z`));
}

export function relativeTime(iso: string, now = Date.now()) {
  const minutes = Math.round((new Date(iso).getTime() - now) / 60_000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}

export function formatDateTime(iso: string, timeZone?: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(new Date(iso));
}

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Value for <input type="datetime-local"> in the browser's own time zone. */
export function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function greeting(timeZone?: string, now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone }).format(now),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Today's date (YYYY-MM-DD) in a timezone. */
export function todayIn(timeZone?: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
}

export function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing isoDate. */
export function startOfWeek(isoDate: string) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return addDays(isoDate, -((d.getUTCDay() + 6) % 7));
}
