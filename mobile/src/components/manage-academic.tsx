import { type ReactNode, useEffect, useState } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, Text, View } from "react-native";
import { errorDetail } from "@/lib/api";
import {
  type CohortRow,
  type Structure,
  type StructurePerson,
  usePersonSearch,
  useSaveCohort,
} from "@/lib/manage-academic";
import type { CourseColor } from "@/lib/types";
import { COURSE, font, radius, useTheme } from "@/theme";
import { ChoiceField, FormError, Sheet } from "./form";
import { Icon } from "./Icon";
import { Avatar, Button, Card, Field, Press, Skeleton, T } from "./ui";

/*
 * Shared pieces for Manage → Sections & subjects on the phone: the section form, the person
 * finder, a searchable list to choose from (the themed stand-in for a long select), and cards.
 */

/** A card with a heading, a count, an optional line under it, and an action on the right. */
export function Panel({
  title,
  count,
  detail,
  action,
  children,
}: {
  title: string;
  count?: number;
  detail?: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <T variant="headline" accessibilityRole="header">
            {title}
            {count !== undefined ? (
              <T variant="headline" tone="ink3">
                {"  "}
                {count}
              </T>
            ) : null}
          </T>
          {detail ? (
            <T variant="callout" tone="ink3">
              {detail}
            </T>
          ) : null}
        </View>
        {action}
      </View>
      {children}
    </Card>
  );
}

/** A small pill-shaped action used in card headings and rows. */
export function SmallAction({
  label,
  onPress,
  tone = "accent",
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  tone?: "accent" | "quiet" | "danger";
  disabled?: boolean;
}) {
  const p = useTheme();
  const look = {
    accent: { bg: p.accentSoft, fg: p.accentInk },
    quiet: { bg: p.fill, fg: p.ink2 },
    danger: { bg: p.dangerSoft, fg: p.danger },
  }[tone];
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={{
        minHeight: 34,
        paddingHorizontal: 12,
        borderRadius: radius.pill,
        backgroundColor: look.bg,
        justifyContent: "center",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ fontFamily: font.semibold, fontSize: 13, color: look.fg }}>{label}</Text>
    </Press>
  );
}

/** A course's colour dot. */
export function Dot({ color, size = 10 }: { color: CourseColor | string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 3, backgroundColor: COURSE[color] ?? COURSE.slate }} />;
}

/** A row that opens something: title, a line or two under it, and a chevron. */
export function LinkRow({
  title,
  lines,
  leading,
  muted = false,
  onPress,
  label,
}: {
  title: ReactNode;
  lines?: (string | null | undefined | false)[];
  leading?: ReactNode;
  muted?: boolean;
  onPress: () => void;
  label: string;
}) {
  const p = useTheme();
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      scaleTo={0.985}
      style={{ backgroundColor: p.fill, borderRadius: radius.md, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 }}
    >
      {leading}
      <View style={{ flex: 1, gap: 2, opacity: muted ? 0.6 : 1 }}>
        {typeof title === "string" ? (
          <T variant="bodyStrong" numberOfLines={1}>
            {title}
          </T>
        ) : (
          title
        )}
        {(lines ?? []).filter(Boolean).map((l, i) => (
          <T key={i} variant="callout" tone="ink2" numberOfLines={2}>
            {l}
          </T>
        ))}
      </View>
      <Icon name="chevron" size={18} color={p.ink3} />
    </Press>
  );
}

export type PickOption<K> = { key: K; label: string; detail?: string; color?: string };

/**
 * One choice from a list that may be long (courses, programs): rows with a tick, and a filter
 * box once there are more than a handful. The themed stand-in for a select.
 */
export function PickList<K extends string | number>({
  label,
  options,
  value,
  onChange,
  empty = "Nothing to choose from yet.",
  error,
}: {
  label: string;
  options: PickOption<K>[];
  value: K | null;
  onChange: (key: K) => void;
  empty?: string;
  error?: string | null;
}) {
  const p = useTheme();
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? options.filter((o) => `${o.label} ${o.detail ?? ""}`.toLowerCase().includes(needle))
    : options;
  return (
    <View style={{ gap: 8 }}>
      <T variant="calloutStrong" tone="ink2">
        {label}
      </T>
      {options.length > 6 ? (
        <Field label={`Find a ${label.toLowerCase()}`} value={q} onChangeText={setQ} placeholder="Type to filter" autoCorrect={false} />
      ) : null}
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ borderRadius: radius.md, borderWidth: 1, borderColor: p.line, overflow: "hidden" }}>
        {shown.length === 0 ? (
          <T variant="callout" tone="ink3" style={{ padding: 14 }}>
            {options.length ? "Nothing matches." : empty}
          </T>
        ) : (
          shown.map((o, i) => {
            const on = o.key === value;
            return (
              <Pressable
                key={String(o.key)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={o.detail ? `${o.label}, ${o.detail}` : o.label}
                onPress={() => onChange(o.key)}
                style={{
                  minHeight: 50,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  backgroundColor: on ? p.accentSoft : p.surface,
                  borderTopWidth: i ? 1 : 0,
                  borderTopColor: p.divider,
                }}
              >
                {o.color ? <Dot color={o.color} /> : null}
                <View style={{ flex: 1 }}>
                  <T variant="bodyStrong" numberOfLines={1}>
                    {o.label}
                  </T>
                  {o.detail ? (
                    <T variant="callout" tone="ink2" numberOfLines={1}>
                      {o.detail}
                    </T>
                  ) : null}
                </View>
                {on ? <Icon name="check" size={18} color={p.accentInk} /> : null}
              </Pressable>
            );
          })
        )}
      </View>
      <FormError text={error} />
    </View>
  );
}

/** The course colours, as round swatches. */
export function ColorPicker({ value, onChange, colors }: { value: CourseColor; onChange: (c: CourseColor) => void; colors: CourseColor[] }) {
  const p = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Colour" style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {colors.map((c) => {
        const on = c === value;
        return (
          <Pressable
            key={c}
            accessibilityRole="radio"
            accessibilityLabel={c}
            accessibilityState={{ checked: on }}
            onPress={() => onChange(c)}
            hitSlop={4}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              borderWidth: 2,
              borderColor: on ? p.ink : "transparent",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: COURSE[c] ?? COURSE.slate }} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** A sheet's body: lifts over the keyboard and scrolls. */
export function SheetBody({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView behavior="padding">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14, paddingBottom: 4 }}>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Finds teachers or students to add, leaving out the ones already there. */
export function PersonPickerSheet({
  visible,
  onClose,
  kind,
  title,
  exclude,
  onPick,
  busy = false,
  error,
}: {
  visible: boolean;
  onClose: () => void;
  kind: "student" | "teacher";
  title: string;
  exclude: Set<number>;
  onPick: (p: StructurePerson) => void;
  busy?: boolean;
  error?: string | null;
}) {
  const p = useTheme();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  const people = usePersonSearch(kind, debounced, visible);
  const list = (people.data ?? []).filter((x) => !exclude.has(x.id));
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <KeyboardAvoidingView behavior="padding" style={{ gap: 12, flexShrink: 1 }}>
        <Field label="Search" value={q} onChangeText={setQ} placeholder="Name, email or ID" autoCorrect={false} autoCapitalize="none" autoFocus />
        <FormError text={error} />
        <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 2 }}>
          {people.isPending ? (
            <Skeleton height={56} />
          ) : list.length === 0 ? (
            <T variant="callout" tone="ink3" style={{ padding: 8 }}>
              Nobody matches.
            </T>
          ) : (
            list.map((x) => (
              <View key={x.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 }}>
                <Avatar text={x.initials} size={38} />
                <View style={{ flex: 1 }}>
                  <T variant="bodyStrong" numberOfLines={1}>
                    {x.name}
                  </T>
                  <T variant="callout" tone="ink2" numberOfLines={1}>
                    {x.email}
                  </T>
                </View>
                <Press
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${x.name}`}
                  disabled={busy}
                  onPress={() => onPick(x)}
                  style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: p.accent, justifyContent: "center", opacity: busy ? 0.6 : 1 }}
                >
                  <Text style={{ fontFamily: font.bold, fontSize: 13, color: p.onAccent }}>Add</Text>
                </Press>
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Sheet>
  );
}

const SHIFTS: { key: "" | "morning" | "evening"; label: string }[] = [
  { key: "morning", label: "Morning" },
  { key: "evening", label: "Evening" },
  { key: "", label: "None" },
];

/** Adds a section, or (with `cohort`) changes one. */
export function CohortFormSheet({
  visible,
  onClose,
  s,
  cohort,
}: {
  visible: boolean;
  onClose: () => void;
  s: Structure;
  cohort?: CohortRow;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={cohort ? "Edit section" : "Add section"}>
      {/* Mounted only while open, so it starts from the section's values each time. */}
      {visible ? <CohortForm s={s} cohort={cohort} onDone={onClose} /> : null}
    </Sheet>
  );
}

function CohortForm({ s, cohort, onDone }: { s: Structure; cohort?: CohortRow; onDone: () => void }) {
  const save = useSaveCohort();
  const year = new Date().getFullYear();
  const [programId, setProgramId] = useState<number | null>(cohort?.program_id ?? s.programs[0]?.id ?? null);
  const [start, setStart] = useState(String(cohort?.start_year ?? year));
  const [end, setEnd] = useState(String(cohort?.end_year ?? year + 4));
  const [shift, setShift] = useState<"" | "morning" | "evening">(cohort?.shift ?? "morning");
  const [name, setName] = useState(cohort?.name ?? "");
  const [code, setCode] = useState(cohort?.code ?? "");
  const [error, setError] = useState<string | null>(null);
  const program = s.programs.find((x) => x.id === programId);
  // A suggested code from the parts: "BSCS24-MA". Typed codes win.
  const suggested = `${program?.code ?? ""}${start.slice(2)}-${shift ? shift[0].toUpperCase() : ""}${name.replace(/\s+/g, "").toUpperCase()}`.slice(0, 16);

  function submit() {
    setError(null);
    save.mutate(
      {
        id: cohort?.id,
        body: {
          program_id: programId,
          code: code.trim() || suggested,
          name,
          shift,
          start_year: start ? Number(start) : null,
          end_year: end ? Number(end) : null,
        },
      },
      { onSuccess: onDone, onError: (err) => setError(errorDetail(err, "Couldn't save the section.")) },
    );
  }

  return (
    <SheetBody>
      <PickList
        label="Program"
        value={programId}
        onChange={setProgramId}
        empty="No programs yet. Add one under Departments first."
        options={s.programs.map((x) => ({ key: x.id, label: x.name, detail: x.code }))}
      />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Field label="Batch starts" value={start} onChangeText={(v) => setStart(v.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={4} placeholder="2024" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Batch ends" value={end} onChangeText={(v) => setEnd(v.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={4} placeholder="2028" />
        </View>
      </View>
      <ChoiceField label="Shift" options={SHIFTS} value={shift} onChange={setShift} />
      <Field label="Name (optional)" value={name} onChangeText={setName} maxLength={40} placeholder="A" />
      <Field label="Short code" value={code} onChangeText={setCode} maxLength={16} placeholder={suggested} autoCapitalize="characters" />
      <T variant="callout" tone="ink3">
        The short code shows on timetables and chats (for example “CC-320 · {code.trim() || suggested}”).
      </T>
      <FormError text={error} />
      <Button label={cohort ? "Save" : "Add section"} busy={save.isPending} disabled={!programId} onPress={submit} />
    </SheetBody>
  );
}
