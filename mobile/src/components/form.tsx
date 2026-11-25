import { type ReactNode, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, type TextInputProps, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { font, radius, useTheme } from "@/theme";
import { Icon } from "./Icon";
import { Button, Chip, IconButton, Press, T, Toggle } from "./ui";

/*
 * Pieces for the forms teachers fill in on the phone (assignments, notices, materials, events).
 * Themed throughout: no native pickers, selects or checkboxes.
 */

/** A sheet that slides up from the bottom, over a dimmed screen. */
export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }} />
      <View
        style={{
          backgroundColor: p.surface,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          padding: 20,
          paddingBottom: insets.bottom + 20,
          gap: 14,
          maxHeight: "88%",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <T variant="headline" accessibilityRole="header" style={{ flex: 1 }}>
            {title}
          </T>
          <IconButton icon="close" label="Close" variant="plain" size={36} onPress={onClose} />
        </View>
        {children}
      </View>
    </Modal>
  );
}

/** A multi-line text box, the same look as Field. */
export function TextArea({
  label,
  error,
  minHeight = 120,
  ...input
}: TextInputProps & { label: string; error?: string | null; minHeight?: number }) {
  const p = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <T variant="calloutStrong" tone="ink2">
        {label}
      </T>
      <TextInput
        {...input}
        multiline
        textAlignVertical="top"
        accessibilityLabel={label}
        placeholderTextColor={p.ink3}
        onFocus={(e) => {
          setFocused(true);
          input.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          input.onBlur?.(e);
        }}
        style={{
          minHeight,
          borderRadius: radius.md,
          borderWidth: focused ? 2 : 1,
          borderColor: error ? p.danger : focused ? p.accent : p.line,
          backgroundColor: p.surface,
          padding: focused ? 13 : 14,
          fontFamily: font.regular,
          fontSize: 16,
          lineHeight: 22,
          color: p.ink,
        }}
      />
      {error ? <FormError text={error} /> : null}
    </View>
  );
}

export function FormError({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return (
    <T variant="callout" tone="danger" accessibilityLiveRegion="polite">
      {text}
    </T>
  );
}

/** A labelled set of chips where exactly one is chosen: the themed stand-in for a select. */
export function ChoiceField<K extends string | number>({
  label,
  options,
  value,
  onChange,
  error,
  hint,
}: {
  label: string;
  options: { key: K; label: string }[];
  value: K | null;
  onChange: (key: K) => void;
  error?: string | null;
  hint?: string;
}) {
  return (
    <View style={{ gap: 8 }}>
      <T variant="calloutStrong" tone="ink2">
        {label}
      </T>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((o) => (
          <Chip key={String(o.key)} label={o.label} on={value === o.key} onPress={() => onChange(o.key)} />
        ))}
      </View>
      {hint ? (
        <T variant="caption" tone="ink3" style={{ fontWeight: "400" }}>
          {hint}
        </T>
      ) : null}
      {error ? <FormError text={error} /> : null}
    </View>
  );
}

/** A label (and a line under it) with a switch on the right. */
export function SwitchRow({
  label,
  detail,
  value,
  onChange,
}: {
  label: string;
  detail?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 }}>
      <View style={{ flex: 1 }}>
        <T variant="bodyStrong">{label}</T>
        {detail ? (
          <T variant="callout" tone="ink3">
            {detail}
          </T>
        ) : null}
      </View>
      <Toggle label={label} value={value} onChange={onChange} />
    </View>
  );
}

/** A whole number with − and + either side, for points and attempts. */
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 1000,
  step = 1,
  format,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (n: number) => string;
}) {
  const p = useTheme();
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <View style={{ gap: 6, flex: 1 }}>
      <T variant="calloutStrong" tone="ink2">
        {label}
      </T>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: format ? format(value) : String(value) }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => onChange(clamp(value + (e.nativeEvent.actionName === "increment" ? step : -step)))}
        style={{
          minHeight: 50,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: p.line,
          backgroundColor: p.surface,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 4,
        }}
      >
        <IconButton icon="minus" label={`Less ${label.toLowerCase()}`} variant="plain" size={40} onPress={() => onChange(clamp(value - step))} />
        <Text style={{ flex: 1, textAlign: "center", fontFamily: font.bold, fontSize: 16, color: p.ink }}>
          {format ? format(value) : value}
        </Text>
        <IconButton icon="plus" label={`More ${label.toLowerCase()}`} variant="plain" size={40} onPress={() => onChange(clamp(value + step))} />
      </View>
    </View>
  );
}

/* ---------- Date and time ---------- */

const pad = (n: number) => String(n).padStart(2, "0");
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function formatPicked(d: Date, withTime = true) {
  const day = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  return withTime ? `${day}, ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : day;
}

/** Tomorrow-ish defaults: `days` from now at hh:mm, on the phone's clock. */
export function atDaysFromNow(days: number, hour = 23, minute = 59) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

const MINUTES = [0, 15, 30, 45, 59];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * A date (and time) field. Tapping it opens a sheet with a month to pick a day from, and the
 * hour and minute as chips. Times are on the phone's clock, as the website uses the browser's.
 */
export function DateTimeField({
  label,
  value,
  onChange,
  error,
  withTime = true,
  minDate,
}: {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
  error?: string | null;
  withTime?: boolean;
  minDate?: Date;
}) {
  const p = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [month, setMonth] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));

  function show() {
    setDraft(value);
    setMonth(new Date(value.getFullYear(), value.getMonth(), 1));
    setOpen(true);
  }

  const cells = useMemo(() => {
    const first = new Date(month);
    const lead = (first.getDay() + 6) % 7; // Monday first
    const inMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: inMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
    ];
  }, [month]);
  const floor = minDate ? new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()) : null;

  const setDay = (d: Date) => {
    const next = new Date(draft);
    next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
    setDraft(next);
  };
  const setHour = (h: number) => {
    const next = new Date(draft);
    next.setHours(h);
    setDraft(next);
  };
  const setMinute = (m: number) => {
    const next = new Date(draft);
    next.setMinutes(m, 0, 0);
    setDraft(next);
  };

  return (
    <View style={{ gap: 6, flex: 1 }}>
      <T variant="calloutStrong" tone="ink2">
        {label}
      </T>
      <Press
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${formatPicked(value, withTime)}. Change`}
        scaleTo={0.99}
        onPress={show}
        style={{
          minHeight: 50,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: error ? p.danger : p.line,
          backgroundColor: p.surface,
          paddingHorizontal: 14,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Icon name="calendar" size={18} color={p.ink2} />
        <T variant="body" style={{ flex: 1 }} numberOfLines={1}>
          {formatPicked(value, withTime)}
        </T>
      </Press>
      {error ? <FormError text={error} /> : null}

      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        <ScrollView contentContainerStyle={{ gap: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <IconButton
              icon="back"
              label="Previous month"
              variant="plain"
              size={40}
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            />
            <T variant="headline" style={{ flex: 1, textAlign: "center" }}>
              {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </T>
            <IconButton
              icon="chevron"
              label="Next month"
              variant="plain"
              size={40}
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            />
          </View>
          <View style={{ flexDirection: "row" }}>
            {WEEKDAYS.map((w, i) => (
              <T key={i} variant="caption" tone="ink3" style={{ flex: 1, textAlign: "center" }}>
                {w}
              </T>
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {cells.map((d, i) => {
              if (!d) return <View key={`e${i}`} style={{ width: `${100 / 7}%`, height: 42 }} />;
              const on = sameDay(d, draft);
              const today = sameDay(d, new Date());
              const off = !!floor && d < floor;
              return (
                <View key={d.getDate()} style={{ width: `${100 / 7}%`, height: 42, alignItems: "center", justifyContent: "center" }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
                    accessibilityState={{ selected: on, disabled: off }}
                    disabled={off}
                    onPress={() => setDay(d)}
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: on ? p.accent : "transparent",
                      borderWidth: today && !on ? 1 : 0,
                      borderColor: p.accent,
                      opacity: off ? 0.3 : 1,
                    }}
                  >
                    <Text style={{ fontFamily: on ? font.bold : font.medium, fontSize: 15, color: on ? p.onAccent : p.ink }}>
                      {d.getDate()}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
          {withTime ? (
            <>
              <T variant="calloutStrong" tone="ink2">
                Hour
              </T>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {HOURS.map((h) => (
                  <Chip key={h} label={pad(h)} on={draft.getHours() === h} onPress={() => setHour(h)} />
                ))}
              </ScrollView>
              <T variant="calloutStrong" tone="ink2">
                Minute
              </T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {MINUTES.map((m) => (
                  <Chip key={m} label={`:${pad(m)}`} on={draft.getMinutes() === m} onPress={() => setMinute(m)} />
                ))}
                {!MINUTES.includes(draft.getMinutes()) ? <Chip label={`:${pad(draft.getMinutes())}`} on onPress={() => {}} /> : null}
              </View>
            </>
          ) : null}
        </ScrollView>
        <Button
          label={`Set ${formatPicked(draft, withTime)}`}
          onPress={() => {
            onChange(draft);
            setOpen(false);
          }}
        />
      </Sheet>
    </View>
  );
}
