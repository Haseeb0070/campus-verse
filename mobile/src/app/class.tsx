import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { changeOf, isOff, place } from "@/components/classes";
import { StackHeader } from "@/components/StackHeader";
import { Button, Card, Chip, Failed, Pill, Segmented, Skeleton, T, Toggle } from "@/components/ui";
import { errorDetail } from "@/lib/api";
import { addDays, formatDay, formatTime, todayIn } from "@/lib/format";
import { useNow } from "@/lib/now";
import { useMe, useTimetable } from "@/lib/queries";
import { useRepChange } from "@/lib/reps";
import { useClassChange, useLate, useRooms } from "@/lib/teaching";
import type { Occurrence } from "@/lib/types";
import { font, radius, useTheme } from "@/theme";

type Action = "cancelled" | "room_changed" | "moved" | "late";

const LATE_MINUTES = [5, 10, 15, 20, 30, 45];

/** Back to where you came from, or the timetable when this screen was opened directly. */
const leave = () => (router.canGoBack() ? router.back() : router.replace("/timetable"));

/**
 * One class on one day. Its teacher takes attendance, says they're running late, or cancels,
 * re-rooms or moves it; its section's CR or GR cancels or shifts it (the teacher is told, or
 * approves first).
 */
export default function ClassScreen() {
  const { meeting, date } = useLocalSearchParams<{ meeting: string; date: string }>();
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const me = useMe().data;
  const tz = me?.institution?.timezone;
  const now = useNow();
  const day = useTimetable(date ?? null, 1);
  const o = day.data?.find((x) => String(x.meeting_id) === meeting && x.date === date);
  const { undo } = useClassChange();

  const started = o ? new Date(o.starts_at).getTime() <= now : false;
  const canAttend = !!me?.institution?.attendance_enabled && !!o && started && !isOff(o);
  const change = o ? changeOf(o, tz) : null;

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader title={o ? `${o.course_code} · ${o.section_code}` : "Class"} subtitle={date ? formatDay(date) : undefined} />
      {day.isPending ? (
        <View style={{ padding: 16, gap: 12 }}>
          <Skeleton height={150} />
          <Skeleton height={220} />
        </View>
      ) : !o ? (
        <Failed message="This class isn't in the timetable for that day any more." onRetry={() => day.refetch()} />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 32 }}>
          <View style={{ backgroundColor: p.field, borderRadius: radius.xl, padding: 20, gap: 8 }}>
            <T tone="onField" style={{ fontFamily: font.display, fontSize: 26, lineHeight: 30 }}>
              {o.course_title}
            </T>
            <T variant="body" tone="onFieldMuted">
              {formatTime(o.starts_at, tz)} – {formatTime(o.ends_at, tz)} · {place(o)}
            </T>
            {change ? <Pill label={change.label} tone={change.tone} icon="swap" /> : null}
          </View>

          {me?.institution?.attendance_enabled ? (
            <Card style={{ gap: 10 }}>
              <T variant="headline">Attendance</T>
              {canAttend ? (
                <Button
                  label="Take attendance"
                  icon="check"
                  onPress={() =>
                    router.push({ pathname: "/attendance", params: { section: String(o.section_id), date: o.date, meeting: String(o.meeting_id) } })
                  }
                />
              ) : (
                <T variant="callout" tone="ink3">
                  {isOff(o) ? "This class isn't happening, so there's no attendance to take." : "You can take attendance once the class starts."}
                </T>
              )}
            </Card>
          ) : null}

          {!o.can_manage && o.rep_role ? (
            o.change_id ? (
              <Card style={{ gap: 6 }}>
                <T variant="headline">Already changed</T>
                <T variant="callout" tone="ink2">
                  {change?.label ?? "This class was changed."} Only its teacher can change it back.
                </T>
              </Card>
            ) : new Date(o.starts_at).getTime() > now ? (
              <RepForm o={o} tz={tz} role={o.rep_role} />
            ) : null
          ) : o.change_id ? (
            <Card style={{ gap: 10 }}>
              <T variant="headline">Change made</T>
              <T variant="callout" tone="ink2">
                {change?.label ?? "This class was changed."} Undoing it puts the class back as timetabled.
              </T>
              {undo.isError ? (
                <T variant="callout" tone="danger">
                  {errorDetail(undo.error, "Couldn't undo it. Try again.")}
                </T>
              ) : null}
              <Button label="Undo this change" variant="secondary" busy={undo.isPending} onPress={() => undo.mutate(o.change_id!, { onSuccess: () => leave() })} />
            </Card>
          ) : new Date(o.ends_at).getTime() > now ? (
            <ChangeForm o={o} tz={tz} />
          ) : null}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

function ChangeForm({ o, tz }: { o: Occurrence; tz?: string }) {
  const p = useTheme();
  const { make } = useClassChange();
  const late = useLate();
  // Running late: on the day itself, for the teacher.
  const canLate = o.date === todayIn(tz);
  const [lateBy, setLateBy] = useState(o.late_minutes || 10);
  const [action, setAction] = useState<Action>("cancelled");
  const rooms = useRooms(action !== "cancelled");
  const [roomQuery, setRoomQuery] = useState("");
  const [roomId, setRoomId] = useState<number | null>(null);
  const [newDate, setNewDate] = useState<string | null>(null);
  const [newStart, setNewStart] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const start = formatTime(o.starts_at, tz);
  const minutes = Math.round((new Date(o.ends_at).getTime() - new Date(o.starts_at).getTime()) / 60_000);
  const today = todayIn(tz);
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(today, i)), [today]);
  const starts = useMemo(() => Array.from({ length: 11 }, (_, i) => `${String(8 + i).padStart(2, "0")}:00`), []);
  const shownRooms = (rooms.data ?? [])
    .filter((r) => `${r.code} ${r.building}`.toLowerCase().includes(roomQuery.trim().toLowerCase()))
    .slice(0, 24);

  function endOf(hhmm: string) {
    const [h, m] = hhmm.split(":").map(Number);
    const total = h * 60 + m + minutes;
    return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  function save() {
    setError(null);
    if (action === "late") {
      return late.mutate(
        { meeting_id: o.meeting_id, date: o.date, minutes: lateBy, note: note.trim() },
        { onSuccess: () => leave(), onError: (err) => setError(errorDetail(err, "Couldn't tell the class. Try again.")) },
      );
    }
    if (action === "room_changed" && !roomId) return setError("Choose the new room.");
    if (action === "moved" && !newDate) return setError("Choose the day it moves to.");
    const s = newStart ?? start;
    make.mutate(
      {
        meeting_id: o.meeting_id,
        date: o.date,
        status: action,
        new_room_id: action === "cancelled" ? null : roomId,
        new_date: action === "moved" ? newDate : null,
        new_starts_at: action === "moved" ? s : null,
        new_ends_at: action === "moved" ? endOf(s) : null,
        note: note.trim(),
        notify,
      },
      { onSuccess: () => leave(), onError: (err) => setError(errorDetail(err, "Couldn't change the class. Try again.")) },
    );
  }

  const fieldStyle = {
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: p.line,
    backgroundColor: p.bg,
    paddingHorizontal: 14,
    fontFamily: font.regular,
    fontSize: 15,
    color: p.ink,
  } as const;

  return (
    <Card style={{ gap: 12 }}>
      <T variant="headline">Change this class</T>
      <Segmented
        value={action}
        onChange={(a) => {
          setAction(a);
          setError(null);
        }}
        options={[
          { key: "cancelled", label: "Cancel" },
          { key: "room_changed", label: "Room" },
          { key: "moved", label: "Move" },
          ...(canLate ? [{ key: "late" as const, label: "Late" }] : []),
        ]}
      />

      {action === "late" ? (
        <>
          <T variant="calloutStrong" tone="ink2">
            How late will you start?
          </T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {LATE_MINUTES.map((m) => (
              <Chip key={m} label={`${m} min`} on={lateBy === m} onPress={() => setLateBy(m)} />
            ))}
            {o.late_minutes ? <Chip label="On time after all" on={lateBy === 0} onPress={() => setLateBy(0)} /> : null}
          </View>
          <T variant="callout" tone="ink3">
            Students are told straight away, and the class shows the new start.
          </T>
        </>
      ) : null}

      {action === "moved" ? (
        <>
          <T variant="calloutStrong" tone="ink2">
            New day
          </T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {days.map((d) => (
              <Chip key={d} label={formatDay(d, { weekday: "short", month: "short" })} on={newDate === d} onPress={() => setNewDate(d)} />
            ))}
          </ScrollView>
          <T variant="calloutStrong" tone="ink2">
            Starts ({minutes} minutes)
          </T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Chip label={`Same time, ${start}`} on={newStart === null} onPress={() => setNewStart(null)} />
            {starts.map((h) => (
              <Chip key={h} label={h} on={newStart === h} onPress={() => setNewStart(h)} />
            ))}
          </ScrollView>
        </>
      ) : null}

      {action === "room_changed" || action === "moved" ? (
        <>
          <T variant="calloutStrong" tone="ink2">
            {action === "moved" ? "Room (leave it for the usual one)" : "New room"}
          </T>
          <TextInput
            value={roomQuery}
            onChangeText={setRoomQuery}
            placeholder="Find a room"
            placeholderTextColor={p.ink3}
            accessibilityLabel="Find a room"
            style={fieldStyle}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {rooms.isPending ? (
              <Skeleton height={36} style={{ flex: 1 }} />
            ) : (
              shownRooms.map((r) => (
                <Chip key={r.id} label={r.building ? `${r.code} · ${r.building}` : r.code} on={roomId === r.id} onPress={() => setRoomId(roomId === r.id ? null : r.id)} />
              ))
            )}
          </View>
        </>
      ) : null}

      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder={action === "cancelled" ? "Why (shown to students)" : action === "late" ? "Why (optional)" : "A note for students (optional)"}
        placeholderTextColor={p.ink3}
        accessibilityLabel="Note for students"
        maxLength={200}
        style={fieldStyle}
      />
      {action !== "late" ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <T variant="body" style={{ flex: 1 }}>
            Tell the students now
          </T>
          <Toggle label="Tell the students now" value={notify} onChange={setNotify} />
        </View>
      ) : null}
      {error ? (
        <T variant="callout" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </T>
      ) : null}
      <Button
        label={
          action === "cancelled"
            ? "Cancel this class"
            : action === "moved"
              ? "Move this class"
              : action === "late"
                ? lateBy
                  ? `Tell them: ${lateBy} min late`
                  : "Tell them: on time"
                : "Change the room"
        }
        variant={action === "cancelled" ? "danger" : "primary"}
        busy={make.isPending || late.isPending}
        onPress={save}
      />
    </Card>
  );
}

/** A CR or GR cancels or shifts the lecture. The teacher is told, or has to approve first. */
function RepForm({ o, tz, role }: { o: Occurrence; tz?: string; role: "cr" | "gr" }) {
  const p = useTheme();
  const send = useRepChange();
  const [action, setAction] = useState<"cancel" | "shift">("cancel");
  const [newDate, setNewDate] = useState<string | null>(null);
  const [newStart, setNewStart] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const start = formatTime(o.starts_at, tz);
  const minutes = Math.round((new Date(o.ends_at).getTime() - new Date(o.starts_at).getTime()) / 60_000);
  const today = todayIn(tz);
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(today, i)), [today]);
  const starts = useMemo(() => Array.from({ length: 11 }, (_, i) => `${String(8 + i).padStart(2, "0")}:00`), []);

  function endOf(hhmm: string) {
    const [h, m] = hhmm.split(":").map(Number);
    const total = h * 60 + m + minutes;
    return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  function save() {
    setError(null);
    if (action === "shift" && !newDate) return setError("Choose the day it shifts to.");
    const s = newStart ?? start;
    send.mutate(
      {
        meeting_id: o.meeting_id,
        date: o.date,
        action,
        new_date: action === "shift" ? newDate : null,
        new_starts_at: action === "shift" ? s : null,
        new_ends_at: action === "shift" ? endOf(s) : null,
        note: note.trim(),
      },
      {
        onSuccess: (req) =>
          setDone(
            req.stage === "applied"
              ? `Done. ${action === "cancel" ? "The lecture is cancelled" : "The lecture is shifted"} and the teacher has been told.`
              : req.stage === "cr_approval"
                ? "Sent. A CR has to agree first, then the teacher."
                : "Sent to the teacher. It happens once they approve, at least 15 minutes before the lecture.",
          ),
        onError: (err) => setError(errorDetail(err, "Couldn't send it. Try again.")),
      },
    );
  }

  if (done) {
    return (
      <Card style={{ gap: 10 }}>
        <T variant="headline">{action === "cancel" ? "Cancellation" : "Shift"}</T>
        <T variant="body">{done}</T>
        <Button label="Class requests" variant="secondary" onPress={() => router.replace("/requests")} />
      </Card>
    );
  }

  const fieldStyle = {
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: p.line,
    backgroundColor: p.bg,
    paddingHorizontal: 14,
    fontFamily: font.regular,
    fontSize: 15,
    color: p.ink,
  } as const;

  return (
    <Card style={{ gap: 12 }}>
      <T variant="headline">As {role.toUpperCase()}</T>
      <T variant="callout" tone="ink2">
        You can cancel or shift this lecture. The teacher is told each time{role === "gr" ? "; cancelling also needs a CR to agree" : ""}.
      </T>
      <Segmented
        value={action}
        onChange={(a) => {
          setAction(a);
          setError(null);
        }}
        options={[
          { key: "cancel", label: "Cancel" },
          { key: "shift", label: "Shift" },
        ]}
      />
      {action === "shift" ? (
        <>
          <T variant="calloutStrong" tone="ink2">
            New day
          </T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {days.map((d) => (
              <Chip key={d} label={formatDay(d, { weekday: "short", month: "short" })} on={newDate === d} onPress={() => setNewDate(d)} />
            ))}
          </ScrollView>
          <T variant="calloutStrong" tone="ink2">
            Starts ({minutes} minutes)
          </T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Chip label={`Same time, ${start}`} on={newStart === null} onPress={() => setNewStart(null)} />
            {starts.map((h) => (
              <Chip key={h} label={h} on={newStart === h} onPress={() => setNewStart(h)} />
            ))}
          </ScrollView>
        </>
      ) : null}
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Why (the teacher and students see it)"
        placeholderTextColor={p.ink3}
        accessibilityLabel="Reason"
        maxLength={200}
        style={fieldStyle}
      />
      {error ? (
        <T variant="callout" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </T>
      ) : null}
      <Button
        label={action === "cancel" ? "Cancel this lecture" : "Shift this lecture"}
        variant={action === "cancel" ? "danger" : "primary"}
        busy={send.isPending}
        onPress={save}
      />
    </Card>
  );
}
