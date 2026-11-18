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

/** "in 20 minutes", "2 hours ago", "tomorrow". Hermes (the app's JavaScript engine on Android)
 *  has no Intl.RelativeTimeFormat, so English words stand in where it's missing. */
export function relativeTime(iso: string, now = Date.now()) {
  const minutes = Math.round((new Date(iso).getTime() - now) / 60_000);
  if (Math.abs(minutes) < 60) return relative(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative(hours, "hour");
  return relative(Math.round(hours / 24), "day");
}

type Unit = "minute" | "hour" | "day";

function relative(value: number, unit: Unit) {
  if (typeof Intl !== "undefined" && "RelativeTimeFormat" in Intl) {
    return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(value, unit);
  }
  if (value === 0) return unit === "day" ? "today" : unit === "hour" ? "this hour" : "now";
  if (unit === "day" && value === 1) return "tomorrow";
  if (unit === "day" && value === -1) return "yesterday";
  const n = Math.abs(value);
  const words = `${n} ${unit}${n === 1 ? "" : "s"}`;
  return value > 0 ? `in ${words}` : `${words} ago`;
}

/** When a class starts, in words: "Starts in 20 minutes", "Today at 13:00", "Tomorrow at 10:30",
 *  "Thursday at 09:00", or "Mon, Nov 16 at 09:00" once it's more than a week away. */
export function startsLabel(date: string, startsAt: string, today: string, timeZone?: string, now = Date.now()) {
  const time = formatTime(startsAt, timeZone);
  if (date === today) {
    return new Date(startsAt).getTime() - now < 60 * 60_000 ? `Starts ${relativeTime(startsAt, now)}` : `Today at ${time}`;
  }
  if (date === addDays(today, 1)) return `Tomorrow at ${time}`;
  if (date < addDays(today, 7)) return `${formatDay(date, { day: undefined, month: undefined })} at ${time}`;
  return `${formatDay(date, { weekday: "short", month: "short" })} at ${time}`;
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
  // From the parts, not a locale's layout: phones format "en-CA" differently.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
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

/** A chat list's timestamp: "13:12" today, "Yesterday", "Mon" this week, else "16 Nov". */
export function listTime(iso: string, timeZone?: string, now = new Date()) {
  const day = todayIn(timeZone, new Date(iso));
  const today = todayIn(timeZone, now);
  if (day === today) return formatTime(iso, timeZone);
  if (day === addDays(today, -1)) return "Yesterday";
  if (day > addDays(today, -7)) return formatDay(day, { weekday: "short", day: undefined, month: undefined });
  return formatDay(day, { weekday: undefined, month: "short" });
}

/** Minutes until an instant, rounded down, never negative. */
export function minutesUntil(iso: string, now = Date.now()) {
  return Math.max(0, Math.floor((new Date(iso).getTime() - now) / 60_000));
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
