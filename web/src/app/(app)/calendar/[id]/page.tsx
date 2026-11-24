"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { DatePicker, DateTimeField, todayIso } from "@/components/date-picker";
import { ChevronLeftIcon, PinIcon, VideoIcon } from "@/components/icons";
import { Linkified } from "@/components/linkified";
import { ApiError, apiFetch, errorDetail } from "@/lib/api";
import { formatTime, relativeTime, toLocalInput } from "@/lib/format";
import { categoryTone, useAttendees, useEvent } from "@/lib/events";
import type { CampusEvent } from "@/lib/events";
import { useMe } from "@/lib/queries";

function when(e: CampusEvent, tz?: string) {
  const day = (iso: string) =>
    new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", timeZone: tz })
      .format(new Date(iso));
  const sameDay = day(e.starts_at) === day(e.ends_at);
  if (e.all_day) return sameDay ? `${day(e.starts_at)}, all day` : `${day(e.starts_at)} to ${day(e.ends_at)}`;
  return sameDay
    ? `${day(e.starts_at)}, ${formatTime(e.starts_at, tz)} to ${formatTime(e.ends_at, tz)}`
    : `${day(e.starts_at)} ${formatTime(e.starts_at, tz)} to ${day(e.ends_at)} ${formatTime(e.ends_at, tz)}`;
}

function places(e: CampusEvent) {
  if (e.capacity === null) return `${e.going} going`;
  const left = e.capacity - e.going;
  if (left > 0) return `${e.going} going · ${left} ${left === 1 ? "place" : "places"} left`;
  return `Full · ${e.waiting} waiting`;
}

function Attendees({ id }: { id: number }) {
  const people = useAttendees(id, true);
  const going = people.data?.filter((p) => p.status === "going") ?? [];
  const waiting = people.data?.filter((p) => p.status === "waitlisted") ?? [];
  return (
    <section aria-labelledby="who-h" className="glass rounded-card p-3">
      <h2 id="who-h" className="px-3 pt-2 pb-1 text-headline font-semibold">
        Who&apos;s coming <span className="text-ink-3">{going.length}</span>
      </h2>
      {people.data?.length === 0 && <p className="px-3 pb-3 text-body text-ink-2">Nobody has signed up yet.</p>}
      {[["Going", going], ["Waitlist", waiting]].map(([title, list]) =>
        (list as typeof going).length > 0 ? (
          <div key={title as string}>
            {title === "Waitlist" && <p className="px-3 pt-2 text-caption font-semibold text-ink-2">Waitlist, in order</p>}
            <ul>
              {(list as typeof going).map((p, i) => (
                <li key={p.id} className="flex items-center gap-3 rounded-row p-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-fill-strong text-caption font-semibold">
                    {title === "Waitlist" ? i + 1 : p.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-semibold">{p.name}</span>
                    <span className="block truncate text-footnote text-ink-2">{p.email} · {relativeTime(p.signed_up_at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
    </section>
  );
}

export default function EventPage() {
  const id = Number(useParams<{ id: string }>().id);
  const tz = useMe().data?.institution?.timezone;
  const queryClient = useQueryClient();
  const event = useEvent(id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [moving, setMoving] = useState(false);
  const [moveTo, setMoveTo] = useState("");
  const [moveWhy, setMoveWhy] = useState("");
  const notFound = event.error instanceof ApiError && event.error.status === 404;
  const e = event.data;

  async function act(method: string, path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const saved = await apiFetch<CampusEvent>(`/api/events/${id}${path}`, {
        method, body: body === undefined ? undefined : JSON.stringify(body),
      });
      queryClient.setQueryData(["events", "one", id], saved);
      await queryClient.invalidateQueries({ queryKey: ["events"] });
      setCancelling(false);
      setMoving(false);
    } catch (err) {
      setError(errorDetail(err, "That didn't work. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <Link href="/calendar" className="inline-flex items-center gap-1 self-start text-footnote font-semibold text-accent-ink">
        <ChevronLeftIcon className="size-4" /> Calendar
      </Link>
      {event.isPending && <p className="text-body text-ink-2">Loading…</p>}
      {notFound && (
        <div className="glass rounded-card p-6">
          <p className="text-headline font-semibold">This event isn&apos;t available</p>
          <p className="mt-1 text-body text-ink-2">It may be for a group you&apos;re not part of.</p>
        </div>
      )}

      {e && (
        <>
          <header>
            <span className={`inline-block rounded-full px-2.5 py-0.5 text-caption font-semibold ${categoryTone[e.category]}`}>
              {e.category_label}
            </span>
            <h1 className={`mt-2 text-title-1 font-bold ${e.status === "cancelled" ? "text-ink-2 line-through" : ""}`}>{e.title}</h1>
            <p className="mt-1 text-body text-ink-2">Organised by {e.organizer} · for {e.audiences.join(", ")}</p>
          </header>

          {e.status === "cancelled" && (
            <p role="status" className="rounded-row bg-danger/10 px-4 py-3 text-body text-danger-ink">
              <span className="font-semibold">Cancelled.</span> {e.cancel_reason}
            </p>
          )}

          <section aria-label="Details" className="glass flex flex-col gap-4 rounded-card p-5">
            <p className="text-headline font-semibold">{when(e, tz)}</p>
            <div className="flex flex-col gap-2 text-body">
              {e.location && (
                <span className="flex items-center gap-2"><PinIcon className="size-5 shrink-0 text-ink-2" /> {e.location}</span>
              )}
              {e.online_url && (
                <a href={e.online_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 font-semibold text-accent-ink">
                  <VideoIcon className="size-5 shrink-0" /> Join online
                </a>
              )}
            </div>
            {e.description && (
              <p className="whitespace-pre-wrap border-t border-divider pt-4 text-body"><Linkified text={e.description} /></p>
            )}
          </section>

          {e.registration && (
            <section aria-labelledby="signup-h" className="glass flex flex-wrap items-center gap-4 rounded-card p-5">
              <div className="min-w-0 flex-1">
                <h2 id="signup-h" className="text-headline font-semibold">
                  {e.my_status === "going"
                    ? "You're going"
                    : e.my_status === "waitlisted"
                      ? `You're number ${e.my_waitlist_position} on the waitlist`
                      : "Sign up"}
                </h2>
                <p className="text-footnote text-ink-2">
                  {places(e)}
                  {e.my_status === "waitlisted" && ". You'll get a notification if a place opens."}
                  {!e.registration_open && e.status !== "cancelled" && " · Sign-ups have closed"}
                </p>
              </div>
              {e.registration_open && (
                e.my_status ? (
                  <button onClick={() => act("DELETE", "/registration")} disabled={busy}
                    className="press h-11 rounded-full bg-fill-strong px-5 text-body font-semibold disabled:opacity-60">
                    {e.my_status === "going" ? "Give up my place" : "Leave the waitlist"}
                  </button>
                ) : (
                  <button onClick={() => act("POST", "/registration")} disabled={busy}
                    className="press h-11 rounded-full bg-accent px-6 text-body font-semibold text-on-accent disabled:opacity-60">
                    {e.capacity !== null && e.going >= e.capacity ? "Join the waitlist" : "Sign up"}
                  </button>
                )
              )}
            </section>
          )}

          {error && <p role="alert" className="text-footnote text-danger-ink">{error}</p>}

          {e.can_manage && e.status === "scheduled" && (
            <section aria-label="Manage" className="glass flex flex-col gap-3 rounded-card p-5">
              {moving ? (
                <form noValidate className="flex flex-col gap-3"
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    const at = e.all_day ? new Date(`${moveTo.slice(0, 10)}T00:00`) : new Date(moveTo);
                    if (Number.isNaN(at.getTime())) return setError("Pick the new date.");
                    act("POST", "/move", { starts_at: at.toISOString(), reason: moveWhy });
                  }}>
                  <p className="text-headline font-semibold">Move to another date</p>
                  <p className="text-footnote text-ink-2">
                    It keeps its length and place. Everyone it&apos;s for gets a notification with the new date.
                  </p>
                  <label className="flex flex-col gap-1.5 text-footnote font-semibold text-ink-2">
                    {e.all_day ? "New date" : "New date and time"}
                    {e.all_day ? (
                      <DatePicker value={moveTo.slice(0, 10)} label="New date" min={todayIso()}
                        onChange={(d) => setMoveTo(`${d}T00:00`)}
                        className="h-11 w-full rounded-control border border-transparent bg-fill px-3 text-body" />
                    ) : (
                      <DateTimeField value={moveTo} label="New date and time" min={todayIso()} onChange={setMoveTo}
                        className="h-11 w-full rounded-control border border-transparent bg-fill px-3 text-body" />
                    )}
                  </label>
                  <label className="flex flex-col gap-1.5 text-footnote font-semibold text-ink-2">
                    Why (optional, shown to everyone)
                    <input value={moveWhy} maxLength={200} onChange={(ev) => setMoveWhy(ev.target.value)}
                      placeholder="The hall is booked that day."
                      className="h-11 w-full rounded-control border border-transparent bg-fill px-3 text-body outline-none focus:border-accent" />
                  </label>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setMoving(false)}
                      className="press h-10 rounded-full bg-fill-strong px-4 text-footnote font-semibold">Back</button>
                    <button type="submit" disabled={busy || !moveTo}
                      className="press h-10 rounded-full bg-accent px-4 text-footnote font-semibold text-on-accent disabled:opacity-60">
                      {busy ? "Moving…" : "Move it"}
                    </button>
                  </div>
                </form>
              ) : cancelling ? (
                <form noValidate onSubmit={(ev) => { ev.preventDefault(); act("POST", "/cancel", { reason }); }}
                  className="flex flex-col gap-3">
                  <label className="flex flex-col gap-1.5 text-footnote font-semibold text-ink-2">
                    Why it&apos;s cancelled (shown to everyone)
                    <input value={reason} maxLength={300} onChange={(ev) => setReason(ev.target.value)}
                      placeholder="The speaker is ill; we'll reschedule."
                      className="h-11 w-full rounded-control border border-transparent bg-fill px-3 text-body outline-none focus:border-accent" />
                  </label>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setCancelling(false)}
                      className="press h-10 rounded-full bg-fill-strong px-4 text-footnote font-semibold">Keep it</button>
                    <button type="submit" disabled={busy}
                      className="press h-10 rounded-full bg-danger px-4 text-footnote font-semibold text-white disabled:opacity-60">
                      Cancel the event
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-auto text-footnote text-ink-2">You organise this event.</span>
                  <Link href={`/calendar/${id}/edit`}
                    className="press inline-flex h-10 items-center rounded-full bg-fill-strong px-4 text-footnote font-semibold">
                    Edit
                  </Link>
                  <button onClick={() => { setMoveTo(toLocalInput(new Date(e.starts_at))); setMoveWhy(""); setMoving(true); }}
                    className="press h-10 rounded-full bg-fill-strong px-4 text-footnote font-semibold">
                    {e.category === "exam" ? "Move exam" : "Move to another date"}
                  </button>
                  <button onClick={() => setCancelling(true)}
                    className="press h-10 rounded-full px-4 text-footnote font-semibold text-danger-ink hover:bg-danger/10">
                    Cancel event
                  </button>
                </div>
              )}
            </section>
          )}

          {e.can_manage && e.registration && <Attendees id={id} />}
        </>
      )}
    </div>
  );
}
