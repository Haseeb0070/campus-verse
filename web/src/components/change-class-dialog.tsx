"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { addDays, formatDay, formatTime } from "@/lib/format";
import { useRooms } from "@/lib/queries";
import type { Occurrence } from "@/lib/types";
import { DatePicker, TimeSelect, todayIso } from "./date-picker";
import { Select } from "./select";
import { Switch } from "./switch";
import { ChipGroup } from "./chip-group";
import type { RepRequest, RepRole } from "@/lib/reps";

type Action = "cancelled" | "moved" | "room_changed" | "late";

const actions: { value: Action; label: string }[] = [
  { value: "cancelled", label: "Cancel class" },
  { value: "moved", label: "Move" },
  { value: "room_changed", label: "Change room" },
];

const LATE_MINUTES = ["5", "10", "15", "20", "30", "45"] as const;

const statusText: Record<string, string> = {
  cancelled: "cancelled",
  moved: "moved",
  room_changed: "in a different room",
  rescheduled: "moved here from another day",
};

/**
 * Change one lecture. A teacher changes it directly; a CR/GR (asRep) asks: cancel or shift only,
 * and the teacher is told or has to approve first (apps.classreps).
 */
export function ChangeClassDialog({
  occ,
  timeZone,
  onClose,
  asRep,
}: {
  occ: Occurrence;
  timeZone?: string;
  onClose: () => void;
  asRep?: RepRole | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const queryClient = useQueryClient();
  const rooms = useRooms();
  const isRescheduled = occ.status === "rescheduled";
  const [action, setAction] = useState<Action>("cancelled");
  const [newDate, setNewDate] = useState(addDays(occ.date, 1));
  const [start, setStart] = useState(formatTime(occ.starts_at, timeZone));
  const [end, setEnd] = useState(formatTime(occ.ends_at, timeZone));
  const [roomId, setRoomId] = useState("");
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  // Running late: on the day, until the class ends; for teachers only.
  const today = new Date().toDateString() === new Date(occ.starts_at).toDateString();
  const canLate = !asRep && today && Date.now() < new Date(occ.ends_at).getTime();
  const [lateBy, setLateBy] = useState<string>(occ.late_minutes ? String(occ.late_minutes) : "10");
  const choices = asRep
    ? [
        { value: "cancelled" as Action, label: "Cancel lecture" },
        { value: "moved" as Action, label: "Shift" },
      ]
    : canLate
      ? [...actions, { value: "late" as Action, label: "Running late" }]
      : actions;

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function done() {
    await queryClient.invalidateQueries({ queryKey: ["timetable"] });
    await queryClient.invalidateQueries({ queryKey: ["notices"] });
    dialog.current?.close();
  }

  function apiError(err: unknown) {
    if (err instanceof ApiError && err.body && typeof err.body === "object") {
      const body = err.body as { detail?: string; conflicts?: string[] };
      setConflicts(body.conflicts ?? []);
      return body.detail ?? "Couldn't save the change.";
    }
    return "Couldn't reach CampusVerse. Check your connection and try again.";
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setConflicts([]);
    if (action === "room_changed" && !roomId) return setError("Choose the new room.");
    if (action === "moved" && (!newDate || !start || !end)) return setError("Choose the new date and time.");
    setBusy(true);
    if (action === "late") {
      try {
        await apiFetch("/api/timetable/late", {
          method: "POST",
          body: JSON.stringify({ meeting_id: occ.meeting_id, date: occ.date, minutes: Number(lateBy), note }),
        });
        await done();
      } catch (err) {
        setError(apiError(err));
        setBusy(false);
      }
      return;
    }
    if (asRep) {
      try {
        const req = await apiFetch<RepRequest>("/api/reps/requests", {
          method: "POST",
          body: JSON.stringify({
            meeting_id: occ.meeting_id,
            date: occ.date,
            action: action === "cancelled" ? "cancel" : "shift",
            note,
            ...(action === "moved" && { new_date: newDate, new_starts_at: start, new_ends_at: end }),
          }),
        });
        await queryClient.invalidateQueries({ queryKey: ["timetable"] });
        await queryClient.invalidateQueries({ queryKey: ["reps"] });
        setSent(
          req.stage === "applied"
            ? "Done. The class has been told, and the teacher has been asked whether they knew."
            : req.stage === "cr_approval"
              ? "Sent to your class's CR. Once they agree, it goes to the teacher."
              : "Sent to the teacher. It happens once they approve, at least 15 minutes before the lecture.",
        );
      } catch (err) {
        setError(apiError(err));
      } finally {
        setBusy(false);
      }
      return;
    }
    try {
      await apiFetch("/api/timetable/changes", {
        method: "POST",
        body: JSON.stringify({
          meeting_id: occ.meeting_id,
          date: occ.date,
          status: action,
          note,
          notify,
          ...(action === "moved" && { new_date: newDate, new_starts_at: start, new_ends_at: end }),
          ...(action === "room_changed" && { new_room_id: Number(roomId) }),
        }),
      });
      await done();
    } catch (err) {
      setError(apiError(err));
      setBusy(false);
    }
  }

  async function undo() {
    if (!occ.change_id) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/timetable/changes/${occ.change_id}`, { method: "DELETE" });
      await done();
    } catch (err) {
      setError(apiError(err));
      setBusy(false);
    }
  }

  const field =
    "h-11 w-full rounded-control border border-transparent bg-fill px-3 text-body outline-none focus:border-accent";

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="change-title"
      className="m-auto w-[min(34rem,calc(100%-2rem))] rounded-card border border-divider bg-[var(--cv-bg)] p-0 text-ink shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm"
    >
      <form onSubmit={save} className="arrive flex flex-col gap-5 p-6">
        <header>
          <h2 id="change-title" className="text-title-2 font-bold">
            {occ.course_title} · {occ.section_code}
          </h2>
          <p className="mt-0.5 text-body text-ink-2">
            {formatDay(occ.date, { month: "short" })}, {formatTime(occ.starts_at, timeZone)}–
            {formatTime(occ.ends_at, timeZone)}
            {occ.room && ` · ${occ.room}`}
          </p>
        </header>

        {sent && (
          <p role="status" className="rounded-row bg-success/12 px-4 py-3 text-footnote font-medium text-success-ink">{sent}</p>
        )}

        {!asRep && occ.change_id && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-row bg-warning/15 px-4 py-3">
            <span className="text-footnote font-medium">
              This class is {statusText[occ.status] ?? "changed"}.
            </span>
            <button
              type="button"
              onClick={undo}
              disabled={busy}
              className="press rounded-full bg-fill-strong px-3 py-1.5 text-footnote font-semibold"
            >
              Undo change
            </button>
          </div>
        )}

        {!isRescheduled && !sent && (
          <>
            {asRep && (
              <p className="text-footnote text-ink-2">
                As {asRep.toUpperCase()}, you can cancel or shift this lecture. The teacher is told each time
                {asRep === "gr" ? "; cancelling also needs a CR to agree" : ""}.
              </p>
            )}
            <div role="radiogroup" aria-label="What changes" className="flex rounded-control bg-fill p-1">
              {choices.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  role="radio"
                  aria-checked={action === a.value}
                  onClick={() => {
                    setAction(a.value);
                    setError(null);
                    setConflicts([]);
                  }}
                  className={`h-9 flex-1 rounded-[9px] text-footnote font-semibold transition-colors ${
                    action === a.value ? "bg-[var(--cv-bg)] shadow-sm" : "text-ink-2"
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>

            {action === "moved" && (
              <div className="grid grid-cols-2 gap-3">
                <label className="col-span-2 flex flex-col gap-1.5 text-footnote font-semibold text-ink-2">
                  New date
                  <DatePicker value={newDate} onChange={setNewDate} label="New date" min={todayIso()} className={field} />
                </label>
                <label className="flex flex-col gap-1.5 text-footnote font-semibold text-ink-2">
                  Starts
                  <TimeSelect value={start} onChange={setStart} label="Starts" className={field} />
                </label>
                <label className="flex flex-col gap-1.5 text-footnote font-semibold text-ink-2">
                  Ends
                  <TimeSelect value={end} onChange={setEnd} label="Ends" className={field} />
                </label>
              </div>
            )}

            {action === "late" && (
              <div className="flex flex-col gap-2">
                <span className="text-footnote font-semibold text-ink-2">How late will you be?</span>
                <ChipGroup<string>
                  label="Minutes late"
                  value={lateBy}
                  onChange={setLateBy}
                  options={LATE_MINUTES.map((m) => ({ value: m, label: `${m} min` }))}
                />
                <p className="text-footnote text-ink-2">
                  Students get a notification with the new start time.
                  {occ.late_minutes ? " " : ""}
                </p>
                {!!occ.late_minutes && (
                  <button type="button" disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await apiFetch("/api/timetable/late", { method: "POST", body: JSON.stringify({ meeting_id: occ.meeting_id, date: occ.date, minutes: 0 }) });
                        await done();
                      } catch (err) {
                        setError(apiError(err));
                        setBusy(false);
                      }
                    }}
                    className="press self-start rounded-full bg-fill-strong px-3 py-1.5 text-footnote font-semibold">
                    I&apos;m on time after all
                  </button>
                )}
              </div>
            )}

            {action === "room_changed" && (
              <label className="flex flex-col gap-1.5 text-footnote font-semibold text-ink-2">
                New room
                <Select value={roomId} onChange={setRoomId} label="New room" placeholder="Choose a room"
                  className={field}
                  options={(rooms.data ?? [])
                    .filter((r) => r.code !== occ.room)
                    .map((r) => ({ value: String(r.id), label: r.code, detail: r.building || undefined }))} />
              </label>
            )}

            <label className="flex flex-col gap-1.5 text-footnote font-semibold text-ink-2">
              Reason <span className="sr-only">(optional)</span>
              <input
                value={note}
                maxLength={200}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional, shown to students"
                className={field}
              />
            </label>

            {!asRep && action !== "late" && (
              <span className="flex items-center gap-3 text-body">
                <Switch checked={notify} onChange={setNotify} label={`Post a notice to section ${occ.section_code}`} />
                Post a notice to section {occ.section_code}
              </span>
            )}
          </>
        )}

        {(error || conflicts.length > 0) && (
          <div role="alert" className="rounded-row bg-danger/10 px-4 py-3 text-footnote text-danger-ink">
            <p className="font-semibold">{error}</p>
            {conflicts.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {conflicts.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="press h-11 rounded-full bg-fill-strong px-5 text-body font-semibold"
          >
            Close
          </button>
          {!isRescheduled && !sent && (
            <button
              type="submit"
              disabled={busy}
              className={`press h-11 rounded-full px-5 text-body font-semibold text-on-accent disabled:opacity-60 ${
                action === "cancelled" ? "bg-danger" : "bg-accent"
              }`}
            >
              {busy ? "Saving…" : action === "cancelled" ? "Cancel this class" : action === "late" ? "Tell the class" : asRep ? "Shift it" : "Save change"}
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
