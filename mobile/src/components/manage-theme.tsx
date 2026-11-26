import { type ReactNode, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/Icon";
import { Chip, Field, Press, Segmented, T } from "@/components/ui";
import {
  type AdminTheme,
  coloursOf,
  CUSTOM_KEYS,
  CUSTOM_LABELS,
  type CustomColours,
  type CustomKey,
  HEX,
  THEMES,
} from "@/lib/manage-admin";
import { buildPalette, font, type Mode, radius, type SiteTheme, useTheme } from "@/theme";

/** Colours offered for the guide: the themes' own, and a few neutrals. */
export const GUIDE_SWATCHES = [
  "#c4602f", "#b4532a", "#9e2b3a", "#c06a12", "#a26a10", "#c4513a",
  "#2f6fae", "#2a8c88", "#3f7a42", "#8e5fb0", "#e3a33b", "#f2c14e",
  "#243329", "#1e2f47", "#3b1d22", "#343820", "#17393a", "#262b33",
  "#f4efe6", "#6e685e", "#241e18",
];

/** Colours offered for each kind of colour in a custom theme, by mode; any other can be typed in. */
const PALETTES: Record<"paper" | "ink" | "colour", Record<Mode, string[]>> = {
  paper: {
    light: ["#ffffff", "#fffdf8", "#fbf8f3", "#f4efe6", "#f3ede2", "#eef2f6", "#f1f5f2", "#f6f1f4", "#e9e0d0", "#e6ebf1"],
    dark: ["#0f0f10", "#121212", "#171512", "#1c1c1c", "#201d19", "#1b2027", "#18201c", "#2a2621", "#262626", "#2b3038"],
  },
  ink: {
    light: ["#111111", "#1f1a16", "#241e18", "#1b2430", "#1d2a24", "#3a2f28"],
    dark: ["#ffffff", "#f2ebe0", "#ece5d8", "#e8edf3", "#e4efe8", "#d9d2c6"],
  },
  colour: {
    light: [
      "#b4532a", "#9e2b3a", "#b8620f", "#9a640e", "#bd4b33", "#2f6fae", "#1d6f5f", "#3f7a42",
      "#7a5a86", "#243329", "#1e2f47", "#3b1d22", "#262b33", "#ffffff", "#fffaf2", "#111111",
    ],
    dark: [
      "#e07a50", "#e0707e", "#e89a45", "#e0a640", "#ef8a72", "#6aa6e0", "#4fb3a0", "#6aa86a",
      "#b394c4", "#22302a", "#1c2a3e", "#351c21", "#23272e", "#ffffff", "#1c120c", "#0b1520",
    ],
  },
};

function paletteFor(key: CustomKey): keyof typeof PALETTES {
  if (key === "bg" || key === "surface" || key === "fill") return "paper";
  if (key === "ink") return "ink";
  return "colour";
}

/** The draft as the app's palette reads it, for previews. */
export function asSite(draft: AdminTheme): SiteTheme {
  return draft as unknown as SiteTheme;
}

/* ---------- Built-in themes and "Your own" ---------- */

export function PresetPicker({ draft, onPick }: { draft: AdminTheme; onPick: (patch: Partial<AdminTheme>) => void }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Built-in themes" style={{ gap: 10 }}>
      {THEMES.map((t) => {
        const light = buildPalette("light", { preset: t.key });
        const dark = buildPalette("dark", { preset: t.key });
        return (
          <PresetRow
            key={t.key}
            on={draft.preset === t.key}
            name={t.name}
            blurb={t.blurb}
            onPress={() => onPick({ preset: t.key })}
            swatch={
              <>
                <View style={{ flex: 2, backgroundColor: light.field, flexDirection: "row", alignItems: "flex-end", gap: 4, padding: 6 }}>
                  <View style={{ height: 12, flex: 1, borderRadius: 6, backgroundColor: light.accent }} />
                  <View style={{ height: 12, width: 12, borderRadius: 6, backgroundColor: "#f4efe6" }} />
                </View>
                <View style={{ flex: 1, backgroundColor: dark.side, justifyContent: "flex-end", padding: 6 }}>
                  <View style={{ height: 12, borderRadius: 6, backgroundColor: dark.accent }} />
                </View>
              </>
            }
          />
        );
      })}
      {/* Your own: every colour chosen by hand, starting from the theme picked last. */}
      <PresetRow
        on={draft.preset === "custom"}
        name="Your own"
        blurb="Choose every colour yourself, for light and dark."
        onPress={() =>
          onPick({
            preset: "custom",
            custom:
              draft.custom.light && draft.custom.dark
                ? draft.custom
                : { light: coloursOf(draft.preset, "light"), dark: coloursOf(draft.preset, "dark") },
          })
        }
        swatch={["#f4efe6", "#b4532a", "#2f6fae", "#2a8c88", "#9e2b3a", "#262b33"].map((c) => (
          <View key={c} style={{ flex: 1, backgroundColor: c }} />
        ))}
      />
    </View>
  );
}

function PresetRow({
  on,
  name,
  blurb,
  swatch,
  onPress,
}: {
  on: boolean;
  name: string;
  blurb: string;
  swatch: ReactNode;
  onPress: () => void;
}) {
  const p = useTheme();
  return (
    <Press
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`${name}. ${blurb}`}
      haptic
      scaleTo={0.98}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 10,
        borderRadius: radius.md,
        backgroundColor: p.fill,
        borderWidth: 2,
        borderColor: on ? p.accent : "transparent",
      }}
    >
      <View style={{ width: 72, height: 44, borderRadius: 8, overflow: "hidden", flexDirection: "row" }}>{swatch}</View>
      <View style={{ flex: 1 }}>
        <T variant="bodyStrong">{name}</T>
        <T variant="caption" tone="ink2" style={{ fontWeight: "400" }}>
          {blurb}
        </T>
      </View>
      {on ? <Icon name="check" size={20} color={p.accentInk} /> : null}
    </Press>
  );
}

/* ---------- Colour rows ---------- */

function Dot({ colour, size, on = false }: { colour: string; size: number; on?: boolean }) {
  const p = useTheme();
  return (
    <View
      style={{
        width: size + 6,
        height: size + 6,
        borderRadius: (size + 6) / 2,
        borderWidth: 2,
        borderColor: on ? p.accent : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: HEX.test(colour) ? colour : "transparent",
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: "rgba(0,0,0,0.18)",
        }}
      />
    </View>
  );
}

function Swatches({ label, value, swatches, onChange }: { label: string; value: string; swatches: string[]; onChange: (v: string) => void }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
      {swatches.map((c) => (
        <Press
          key={c}
          accessibilityRole="button"
          accessibilityLabel={`${label} ${c}`}
          accessibilityState={{ selected: value === c }}
          onPress={() => onChange(c)}
          hitSlop={2}
        >
          <Dot colour={c} size={28} on={value === c} />
        </Press>
      ))}
    </View>
  );
}

/** One part of the guide: the theme's colour, a swatch, or a colour typed in. */
export function GuideColourRow({
  label,
  value,
  themeColour,
  onChange,
}: {
  label: string;
  value: string;
  themeColour: string;
  onChange: (v: string) => void;
}) {
  const p = useTheme();
  const bad = !!value && !HEX.test(value);
  return (
    <View style={{ gap: 8 }}>
      <T variant="calloutStrong" tone="ink2">
        {label}
      </T>
      <Press
        accessibilityRole="button"
        accessibilityState={{ selected: !value }}
        accessibilityLabel={`${label}: the theme's colour`}
        onPress={() => onChange("")}
        style={{
          alignSelf: "flex-start",
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          minHeight: 36,
          paddingHorizontal: 12,
          borderRadius: radius.pill,
          backgroundColor: !value ? p.accent : p.fill,
        }}
      >
        <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: themeColour }} />
        <Text style={{ fontFamily: font.semibold, fontSize: 13, color: !value ? p.onAccent : p.ink }}>{"Theme's"}</Text>
      </Press>
      <Swatches label={label} value={value} swatches={GUIDE_SWATCHES} onChange={onChange} />
      <Field
        label={`${label} colour as hex`}
        value={value}
        onChangeText={(v) => onChange(v.trim().toLowerCase())}
        placeholder="#hex"
        maxLength={7}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        error={bad ? "Colours look like #b4532a." : null}
        style={{ fontFamily: font.medium }}
      />
    </View>
  );
}

function CustomRow({
  label,
  hint,
  value,
  swatches,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  swatches: string[];
  onChange: (v: string) => void;
}) {
  const bad = !HEX.test(value);
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Dot colour={value} size={30} />
        <View style={{ flex: 1 }}>
          <T variant="calloutStrong">{label}</T>
          <T variant="caption" tone="ink3" style={{ fontWeight: "400" }}>
            {hint}
          </T>
        </View>
      </View>
      <Swatches label={label} value={value} swatches={swatches} onChange={onChange} />
      <Field
        label={`${label} as hex`}
        value={value}
        onChangeText={(v) => onChange(v.trim().toLowerCase())}
        maxLength={7}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        error={bad ? "Colours look like #b4532a." : null}
        style={{ fontFamily: font.medium }}
      />
    </View>
  );
}

/** Every colour of the custom theme, for light and for dark. */
export function CustomEditor({
  custom,
  onChange,
}: {
  custom: Record<Mode, CustomColours>;
  onChange: (c: Record<Mode, CustomColours>) => void;
}) {
  const p = useTheme();
  const [mode, setMode] = useState<Mode>("light");
  const colours = custom[mode];
  const setColour = (key: CustomKey, value: string) => onChange({ ...custom, [mode]: { ...colours, [key]: value } });

  return (
    <View style={{ gap: 16, backgroundColor: p.fill, borderRadius: radius.lg, padding: 14 }}>
      <Segmented<Mode>
        value={mode}
        onChange={setMode}
        options={[
          { key: "light", label: "Light mode" },
          { key: "dark", label: "Dark mode" },
        ]}
      />
      <View style={{ gap: 8 }}>
        <T variant="calloutStrong" tone="ink2">
          Start from
        </T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {THEMES.map((t) => (
            <Chip key={t.key} label={t.name} on={false} onPress={() => onChange({ ...custom, [mode]: coloursOf(t.key, mode) })} />
          ))}
        </View>
      </View>
      {CUSTOM_KEYS.map((key) => (
        <CustomRow
          key={`${mode}-${key}`}
          label={CUSTOM_LABELS[key].label}
          hint={CUSTOM_LABELS[key].hint}
          value={colours[key]}
          swatches={PALETTES[paletteFor(key)][mode]}
          onChange={(v) => setColour(key, v)}
        />
      ))}
    </View>
  );
}

/* ---------- Preview ---------- */

/** A small piece of the app drawn in the draft's colours and card look: the Today card, a card
 *  with a button, a chip and a link. Light and dark side by side. */
export function ThemePreview({ draft }: { draft: AdminTheme }) {
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      <PreviewPane draft={draft} mode="light" />
      <PreviewPane draft={draft} mode="dark" />
    </View>
  );
}

function PreviewPane({ draft, mode }: { draft: AdminTheme; mode: Mode }) {
  const c = buildPalette(mode, asSite(draft));
  const r = c.cards.radius;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${mode === "light" ? "Light" : "Dark"} mode preview`}
      style={{ flex: 1, backgroundColor: c.bg, borderRadius: radius.md, padding: 8, gap: 6 }}
    >
      <Text style={{ fontFamily: font.semibold, fontSize: 10, color: c.ink3 }}>{mode === "light" ? "Light" : "Dark"}</Text>
      <View style={{ backgroundColor: c.field, borderRadius: Math.min(r, 12), padding: 8 }}>
        <Text style={{ fontFamily: font.bold, fontSize: 11, color: c.onField }}>Web Development</Text>
        <Text style={{ fontFamily: font.regular, fontSize: 9, color: c.onFieldMuted }}>EC-330 · R-127</Text>
      </View>
      <View
        style={{
          backgroundColor: c.surface,
          borderRadius: Math.min(r, 12),
          borderWidth: c.cards.border ? StyleSheet.hairlineWidth * 2 : 0,
          borderColor: c.line,
          padding: 8,
          gap: 4,
          shadowColor: c.shadow,
          shadowOpacity: mode === "light" && c.cards.shadow ? 0.1 : 0,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 2 },
          elevation: mode === "light" && c.cards.shadow ? 2 : 0,
        }}
      >
        <Text style={{ fontFamily: font.bold, fontSize: 10, color: c.ink }}>Notices</Text>
        <Text style={{ fontFamily: font.regular, fontSize: 9, color: c.ink2 }}>Quiz moved to Thursday</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
          <View style={{ backgroundColor: c.accent, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text style={{ fontFamily: font.semibold, fontSize: 9, color: c.onAccent }}>Save</Text>
          </View>
          <View style={{ backgroundColor: c.fill, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text style={{ fontFamily: font.regular, fontSize: 9, color: c.ink }}>Chip</Text>
          </View>
          <Text style={{ fontFamily: font.semibold, fontSize: 9, color: c.accentInk, textDecorationLine: "underline" }}>Link</Text>
        </View>
      </View>
    </View>
  );
}

/** The guide's three colours as swatches, with its name. */
export function GuideSwatches({ draft }: { draft: AdminTheme }) {
  const p = useTheme();
  const g = buildPalette("light", asSite(draft)).guide;
  const parts = [
    { label: "Body", colour: g.body },
    { label: "Cap", colour: g.cap },
    { label: "Tassel", colour: g.tassel },
  ];
  return (
    <View
      accessible
      accessibilityLabel={`${draft.guide_name.trim() || "Verse"}'s colours: body ${g.body}, cap ${g.cap}, tassel ${g.tassel}`}
      style={{ flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: p.fill, borderRadius: radius.md, padding: 12 }}
    >
      {parts.map((x) => (
        <View key={x.label} style={{ alignItems: "center", gap: 4 }}>
          <Dot colour={x.colour} size={34} />
          <T variant="caption" tone="ink2">
            {x.label}
          </T>
        </View>
      ))}
      <T variant="bodyStrong" numberOfLines={1} style={{ flex: 1, textAlign: "right" }}>
        {draft.guide_name.trim() || "Verse"}
      </T>
    </View>
  );
}
