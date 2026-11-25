import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, ScrollView, View } from "react-native";
import { errorDetail } from "@/lib/api";
import { type CampusEvent, useAttendees, useEventAction } from "@/lib/events";
import { DateTimeField, FormError, Sheet, TextArea } from "./form";
import { Avatar, Button, Card, Divider, T } from "./ui";

/** For the organiser: change, move or cancel the event, and see who signed up. */
export function EventManage({ e }: { e: CampusEvent }) {
  const [sheet, setSheet] = useState<"move" | "cancel" | null>(null);
  return (
    <>
      {e.status === "scheduled" ? (
        <Card style={{ gap: 10 }}>
          <T variant="headline">You organise this</T>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button
              label="Edit"
              icon="pencil"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => router.push({ pathname: "/calendar/edit", params: { id: String(e.id) } })}
            />
            <Button label="Move" icon="swap" variant="secondary" style={{ flex: 1 }} onPress={() => setSheet("move")} />
          </View>
          <Button label="Cancel the event" variant="danger" onPress={() => setSheet("cancel")} />
        </Card>
      ) : null}
      {e.registration ? <Attendees id={e.id} /> : null}
      <MoveSheet e={e} visible={sheet === "move"} onClose={() => setSheet(null)} />
      <CancelSheet e={e} visible={sheet === "cancel"} onClose={() => setSheet(null)} />
    </>
  );
}

function Attendees({ id }: { id: number }) {
  const people = useAttendees(id, true);
  const going = people.data?.filter((p) => p.status === "going") ?? [];
  const waiting = people.data?.filter((p) => p.status === "waitlisted") ?? [];
  if (!people.data) return null;
  return (
    <Card style={{ gap: 4 }}>
      <T variant="headline" style={{ marginBottom: 4 }}>
        Who’s coming
      </T>
      {!people.data.length ? (
        <T variant="body" tone="ink2">
          Nobody has signed up yet.
        </T>
      ) : null}
      {(
        [
          ["Going", going],
          ["Waitlist", waiting],
        ] as const
      ).map(([title, list]) =>
        list.length ? (
          <View key={title} style={{ gap: 4, marginTop: 6 }}>
            <T variant="calloutStrong" tone="ink2">
              {title} · {list.length}
            </T>
            {list.map((a, i) => (
              <View key={a.id}>
                {i > 0 && <Divider inset={48} />}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 }}>
                  <Avatar text={title === "Waitlist" ? String(i + 1) : a.initials} size={36} />
                  <View style={{ flex: 1 }}>
                    <T variant="bodyStrong" numberOfLines={1}>
                      {a.name}
                    </T>
                    <T variant="caption" tone="ink3" numberOfLines={1} style={{ fontWeight: "400" }}>
                      {a.email}
                    </T>
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : null,
      )}
    </Card>
  );
}

function MoveSheet({ e, visible, onClose }: { e: CampusEvent; visible: boolean; onClose: () => void }) {
  const action = useEventAction(e.id);
  const [to, setTo] = useState(() => new Date(e.starts_at));
  const [why, setWhy] = useState("");
  const [error, setError] = useState<string | null>(null);

  function move() {
    const at = e.all_day ? new Date(to.getFullYear(), to.getMonth(), to.getDate(), 0, 0) : to;
    setError(null);
    action.mutate(
      { kind: "move", starts_at: at.toISOString(), reason: why.trim() },
      { onSuccess: onClose, onError: (err) => setError(errorDetail(err, "Couldn't move it. Try again.")) },
    );
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Move to another date">
      <KeyboardAvoidingView behavior="padding">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14 }}>
          <T variant="callout" tone="ink2">
            It keeps its length and place. Everyone it’s for gets a notification with the new date.
          </T>
          <DateTimeField label={e.all_day ? "New date" : "New start"} value={to} onChange={setTo} withTime={!e.all_day} minDate={new Date()} />
          <TextArea label="Why (optional, shown to everyone)" value={why} onChangeText={setWhy} minHeight={70} maxLength={300} />
          <FormError text={error} />
          <Button label="Move it" busy={action.isPending} onPress={move} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Sheet>
  );
}

function CancelSheet({ e, visible, onClose }: { e: CampusEvent; visible: boolean; onClose: () => void }) {
  const action = useEventAction(e.id);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    setError(null);
    action.mutate(
      { kind: "cancel", reason: reason.trim() },
      { onSuccess: onClose, onError: (err) => setError(errorDetail(err, "Couldn't cancel it. Try again.")) },
    );
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Cancel the event">
      <KeyboardAvoidingView behavior="padding">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14 }}>
          <T variant="callout" tone="ink2">
            It stays on the calendar, marked cancelled, and everyone it’s for is told. This can’t be undone.
          </T>
          <TextArea label="Why it’s cancelled (shown to everyone)" value={reason} onChangeText={setReason} minHeight={70} maxLength={300} />
          <FormError text={error} />
          <Button label="Cancel the event" variant="danger" busy={action.isPending} onPress={cancel} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Sheet>
  );
}
