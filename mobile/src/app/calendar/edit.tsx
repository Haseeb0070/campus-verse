import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChoiceField, DateTimeField, FormError, SwitchRow, TextArea } from "@/components/form";
import { StackHeader } from "@/components/StackHeader";
import { Button, Card, Chip, Divider, Failed, Field, Segmented, Skeleton, T } from "@/components/ui";
import { errorDetail } from "@/lib/api";
import {
  CATEGORY_ONE,
  type CampusEvent,
  type EventCategory,
  type EventMode,
  MODE_LABEL,
  useEvent,
  useEventAudiences,
  useSaveEvent,
} from "@/lib/events";
import { useTheme } from "@/theme";

/** Add an event to the calendar (no id) or change one you organise (?id=3). */
export default function EventEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const p = useTheme();
  const existing = useEvent(Number(id ?? 0), !!id);
  if (id && !existing.data) {
    return (
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        <StackHeader title="Edit event" />
        {existing.isPending ? (
          <View style={{ padding: 16 }}>
            <Skeleton height={300} />
          </View>
        ) : (
          <Failed onRetry={() => existing.refetch()} />
        )}
      </View>
    );
  }
  return <EventForm initial={id ? existing.data : undefined} />;
}

function inDays(days: number, hour: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

const CATEGORIES = (Object.keys(CATEGORY_ONE) as EventCategory[]).map((k) => ({ key: k, label: CATEGORY_ONE[k] }));
const MODES = (Object.keys(MODE_LABEL) as EventMode[]).map((k) => ({ key: k, label: MODE_LABEL[k] }));

function EventForm({ initial }: { initial?: CampusEvent }) {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const audiences = useEventAudiences();
  const save = useSaveEvent(initial?.id);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [category, setCategory] = useState<EventCategory>(initial?.category ?? "event");
  const [allDay, setAllDay] = useState(initial?.all_day ?? false);
  const [starts, setStarts] = useState(() => (initial ? new Date(initial.starts_at) : inDays(7, 14)));
  const [ends, setEnds] = useState(() => (initial ? new Date(initial.ends_at) : inDays(7, 15)));
  const [mode, setMode] = useState<EventMode>(initial?.mode ?? "in_person");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [link, setLink] = useState(initial?.online_url ?? "");
  const [registration, setRegistration] = useState(initial?.registration ?? false);
  const [capacity, setCapacity] = useState(initial?.capacity ? String(initial.capacity) : "");
  const [targets, setTargets] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const groups = (audiences.data ?? []).reduce<Record<string, { key: string; label: string }[]>>((acc, a) => {
    (acc[a.group] ??= []).push(a);
    return acc;
  }, {});

  function setStart(d: Date) {
    setStarts(d);
    // Keep the end after the start, an hour on by default.
    if (ends <= d) {
      const later = new Date(d);
      later.setHours(later.getHours() + 1);
      setEnds(later);
    }
  }

  function submit() {
    const startDate = allDay ? new Date(starts.getFullYear(), starts.getMonth(), starts.getDate(), 0, 0) : starts;
    const endDate = allDay ? new Date(ends.getFullYear(), ends.getMonth(), ends.getDate(), 23, 59) : ends;
    let problem: string | null = null;
    if (!title.trim()) problem = "Give the event a title.";
    else if (!initial && targets.length === 0) problem = "Choose who the event is for.";
    else if (!(endDate >= startDate)) problem = "It has to end after it starts.";
    else if (mode !== "online" && !allDay && !location.trim()) problem = "Say where it happens.";
    else if (mode !== "in_person" && !/^https?:\/\/\S+\.\S+/.test(link.trim())) problem = "Add the online link, starting with https://.";
    else if (registration && capacity && !(Number(capacity) >= 1)) problem = "Capacity has to be at least 1, or empty for no limit.";
    setError(problem);
    if (problem) return;
    save.mutate(
      {
        title: title.trim(),
        description,
        category,
        all_day: allDay,
        mode,
        starts_at: startDate.toISOString(),
        ends_at: endDate.toISOString(),
        location: mode === "online" ? "" : location,
        online_url: mode === "in_person" ? "" : link.trim(),
        registration,
        capacity: registration && capacity ? Number(capacity) : null,
        registration_closes_at: null,
        ...(initial ? {} : { targets }),
      },
      {
        onSuccess: (event) => {
          if (initial) router.back();
          else router.replace({ pathname: "/calendar/[id]", params: { id: String(event.id) } });
        },
        onError: (err) => setError(errorDetail(err, "Couldn't save the event. Try again.")),
      },
    );
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader title={initial ? "Edit event" : "New event"} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 32 }}>
        <Card style={{ gap: 16 }}>
          <Field label="Title" value={title} onChangeText={setTitle} maxLength={200} placeholder="Graph algorithms seminar" />
          <ChoiceField label="Kind" value={category} onChange={setCategory} options={CATEGORIES} />
          <TextArea label="About (optional)" value={description} onChangeText={setDescription} minHeight={90} />
        </Card>

        <Card style={{ gap: 14 }}>
          <SwitchRow label="All day" value={allDay} onChange={setAllDay} />
          <DateTimeField label={allDay ? "From" : "Starts"} value={starts} onChange={setStart} withTime={!allDay} minDate={initial ? undefined : new Date()} />
          <DateTimeField label={allDay ? "To" : "Ends"} value={ends} onChange={setEnds} withTime={!allDay} minDate={starts} />
        </Card>

        <Card style={{ gap: 14 }}>
          <Segmented value={mode} onChange={setMode} options={MODES} />
          {mode !== "online" ? <Field label="Place" value={location} onChangeText={setLocation} maxLength={200} placeholder="Main hall" /> : null}
          {mode !== "in_person" ? (
            <Field label="Online link" value={link} onChangeText={setLink} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://" />
          ) : null}
        </Card>

        <Card style={{ gap: 14 }}>
          <SwitchRow label="Sign-up" detail="People take a place; a waitlist opens when it's full." value={registration} onChange={setRegistration} />
          {registration ? (
            <Field label="Places (empty for no limit)" value={capacity} onChangeText={setCapacity} keyboardType="number-pad" placeholder="No limit" />
          ) : null}
        </Card>

        {!initial ? (
          <Card style={{ gap: 12 }}>
            <T variant="headline">Who it’s for</T>
            {audiences.isPending ? (
              <Skeleton height={80} />
            ) : (
              Object.entries(groups).map(([group, list], i) => (
                <View key={group} style={{ gap: 8 }}>
                  {i > 0 && <Divider />}
                  <T variant="calloutStrong" tone="ink2">
                    {group}
                  </T>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {list.map((a) => (
                      <Chip
                        key={a.key}
                        label={a.label}
                        on={targets.includes(a.key)}
                        onPress={() => setTargets((t) => (t.includes(a.key) ? t.filter((k) => k !== a.key) : [...t, a.key]))}
                      />
                    ))}
                  </View>
                </View>
              ))
            )}
          </Card>
        ) : null}

        <FormError text={error} />
        <Button label={initial ? "Save changes" : "Add to the calendar"} busy={save.isPending} onPress={submit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
