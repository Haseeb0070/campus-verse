import * as Haptics from "expo-haptics";
import { type ComponentRef, type ReactNode, type Ref, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextProps,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { courseTone, font, radius, useTheme } from "@/theme";
import { Icon, type IconName } from "./Icon";

/* ---------- Type ---------- */

const variants = {
  display: { fontFamily: font.display, fontSize: 34, lineHeight: 38, letterSpacing: -0.6 },
  title: { fontFamily: font.display, fontSize: 26, lineHeight: 30, letterSpacing: -0.4 },
  headline: { fontFamily: font.bold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 21 },
  bodyStrong: { fontFamily: font.semibold, fontSize: 15, lineHeight: 21 },
  callout: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  calloutStrong: { fontFamily: font.semibold, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: font.semibold, fontSize: 12, lineHeight: 16 },
  eyebrow: { fontFamily: font.semibold, fontSize: 13, lineHeight: 17, letterSpacing: 0.26 },
} as const;

export type Variant = keyof typeof variants;
type Tone = "ink" | "ink2" | "ink3" | "accentInk" | "onField" | "onFieldMuted" | "onAccent" | "danger";

export function T({
  variant = "body",
  tone = "ink",
  style,
  ...rest
}: TextProps & { variant?: Variant; tone?: Tone }) {
  const p = useTheme();
  return <Text {...rest} style={[variants[variant], { color: p[tone] }, style]} />;
}

/* ---------- Press feedback: on press-down, springs back (interruptible) ---------- */

export function Press({
  children,
  style,
  haptic = false,
  scaleTo = 0.97,
  onPressIn,
  onPressOut,
  onPress,
  ...rest
}: PressableProps & { style?: StyleProp<ViewStyle>; haptic?: boolean; scaleTo?: number; children: ReactNode }) {
  const scale = useSharedValue(1);
  const reduced = useReducedMotion();
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        if (!reduced) scale.set(withSpring(scaleTo, { damping: 30, stiffness: 600 }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withSpring(1, { damping: 18, stiffness: 300 }));
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic && Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
        onPress?.(e);
      }}
    >
      <Animated.View style={[style, animated]}>{children}</Animated.View>
    </Pressable>
  );
}

/* ---------- Surfaces ---------- */

export function Card({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const p = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: p.surface,
          borderColor: p.line,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderRadius: radius.lg,
          padding: padded ? 14 : 0,
          shadowColor: p.shadow,
          shadowOpacity: p.mode === "light" ? 0.06 : 0,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: p.mode === "light" ? 1 : 0,
          overflow: padded ? undefined : "hidden",
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const p = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: p.divider, marginLeft: inset }} />;
}

/* ---------- Controls ---------- */

export function IconButton({
  icon,
  label,
  onPress,
  dot = false,
  variant = "outline",
  size = 44,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  dot?: boolean;
  variant?: "outline" | "plain" | "fill" | "accent";
  size?: number;
}) {
  const p = useTheme();
  const bg = { outline: p.surface, plain: "transparent", fill: p.fill, accent: p.accent }[variant];
  const fg = variant === "accent" ? p.onAccent : variant === "fill" ? p.ink2 : p.ink;
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        borderWidth: variant === "outline" ? 1 : 0,
        borderColor: p.line,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name={icon} color={fg} />
      {dot && (
        <View
          style={{
            position: "absolute",
            top: 9,
            right: 10,
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: p.accent,
            borderWidth: 2,
            borderColor: bg === "transparent" ? p.bg : bg,
          }}
        />
      )}
    </Press>
  );
}

export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  busy = false,
  disabled = false,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "field" | "danger";
  icon?: IconName;
  busy?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const p = useTheme();
  const look = {
    primary: { bg: p.accent, fg: p.onAccent, border: p.accent },
    secondary: { bg: p.surface, fg: p.ink, border: p.line },
    field: { bg: "transparent", fg: p.onField, border: p.fieldLine },
    danger: { bg: p.dangerSoft, fg: p.danger, border: p.dangerSoft },
  }[variant];
  const off = disabled || busy;
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy }}
      disabled={off}
      haptic={variant === "primary"}
      onPress={onPress}
      style={[
        {
          minHeight: 48,
          paddingHorizontal: 18,
          borderRadius: radius.pill,
          backgroundColor: look.bg,
          borderWidth: 1,
          borderColor: look.border,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={look.fg} />
      ) : (
        <>
          {icon && <Icon name={icon} size={18} color={look.fg} />}
          <Text style={{ fontFamily: font.bold, fontSize: 15, color: look.fg }}>{label}</Text>
        </>
      )}
    </Press>
  );
}

export function Field({
  label,
  error,
  style,
  ...input
}: TextInputProps & { label: string; error?: string | null; ref?: Ref<ComponentRef<typeof TextInput>> }) {
  const p = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <T variant="calloutStrong" tone="ink2">
        {label}
      </T>
      <TextInput
        {...input}
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
        style={[
          {
            minHeight: 50,
            borderRadius: radius.md,
            borderWidth: focused ? 2 : 1,
            borderColor: error ? p.danger : focused ? p.accent : p.line,
            backgroundColor: p.surface,
            paddingHorizontal: focused ? 15 : 16,
            fontFamily: font.regular,
            fontSize: 16,
            color: p.ink,
          },
          style,
        ]}
      />
      {error ? (
        <T variant="callout" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </T>
      ) : null}
    </View>
  );
}

/** The design's segmented control: one track, the chosen tab raised on paper. */
export function Segmented<K extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: K; label: string; count?: number }[];
  value: K;
  onChange: (key: K) => void;
}) {
  const p = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        backgroundColor: p.fill,
        borderColor: p.line,
        borderWidth: 1,
        borderRadius: radius.md,
        padding: 4,
        gap: 4,
      }}
    >
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (!on && Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
              onChange(o.key);
            }}
            style={{
              flex: 1,
              minHeight: 38,
              borderRadius: radius.sm,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 6,
              // Raised: paper on the light track, a lighter step on the dark one.
              backgroundColor: on ? (p.mode === "dark" ? p.line : p.surface) : "transparent",
              shadowColor: p.shadow,
              shadowOpacity: on ? 0.12 : 0,
              shadowRadius: 2,
              shadowOffset: { width: 0, height: 1 },
              elevation: on ? 1 : 0,
            }}
          >
            <Text style={{ fontFamily: on ? font.bold : font.medium, fontSize: 14, color: on ? p.ink : p.ink2 }}>
              {o.label}
            </Text>
            {o.count ? <CountBadge count={o.count} small /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const p = useTheme();
  return (
    <Press
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={{
        minHeight: 36,
        paddingHorizontal: 14,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: on ? p.ink : p.line,
        backgroundColor: on ? p.ink : p.surface,
        justifyContent: "center",
      }}
    >
      <Text style={{ fontFamily: on ? font.bold : font.medium, fontSize: 13, color: on ? p.bg : p.ink2 }}>{label}</Text>
    </Press>
  );
}

/* ---------- Bits ---------- */

export function CountBadge({ count, small = false }: { count: number; small?: boolean }) {
  const p = useTheme();
  const h = small ? 18 : 22;
  return (
    <View
      accessibilityLabel={`${count} unread`}
      style={{
        minWidth: h,
        height: h,
        borderRadius: h / 2,
        paddingHorizontal: 6,
        backgroundColor: p.accent,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontFamily: font.bold, fontSize: small ? 11 : 12, color: p.onAccent }}>
        {count > 99 ? "99+" : count}
      </Text>
    </View>
  );
}

export function CourseTag({ color, label }: { color: string | null | undefined; label: string }) {
  const p = useTheme();
  const tone = courseTone(color, p);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tone.dot }} />
      <T variant="caption" tone="ink2" style={{ fontFamily: font.bold }}>
        {label}
      </T>
    </View>
  );
}

export function Avatar({ text, color, size = 48 }: { text: string; color?: string | null; size?: number }) {
  const p = useTheme();
  const tone = courseTone(color ?? "slate", p);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: tone.soft,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontFamily: font.bold, fontSize: size >= 44 ? 14 : 12, color: tone.ink }}>{text}</Text>
    </View>
  );
}

export function Pill({ label, tone = "neutral", icon }: { label: string; tone?: "neutral" | "warn" | "accent" | "danger" | "success"; icon?: IconName }) {
  const p = useTheme();
  const look = {
    neutral: { bg: p.fill, fg: p.ink2 },
    warn: { bg: p.warnBg, fg: p.warnInk },
    accent: { bg: p.accentSoft, fg: p.accentInk },
    danger: { bg: p.dangerSoft, fg: p.danger },
    success: { bg: p.fill, fg: p.success },
  }[tone];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        alignSelf: "flex-start",
        backgroundColor: look.bg,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
      }}
    >
      {icon && <Icon name={icon} size={14} color={look.fg} />}
      <Text style={{ fontFamily: font.bold, fontSize: 12, color: look.fg }}>{label}</Text>
    </View>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const p = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
      <Text accessibilityRole="header" style={{ fontFamily: font.display, fontSize: 22, color: p.ink, letterSpacing: -0.3 }}>
        {title}
      </Text>
      {action && (
        <Pressable accessibilityRole="link" onPress={onAction} hitSlop={12}>
          <Text style={{ fontFamily: font.semibold, fontSize: 14, color: p.accentInk }}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

/* ---------- States ---------- */

export function Skeleton({ height = 72, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  const p = useTheme();
  const reduced = useReducedMotion();
  const opacity = useSharedValue(0.55);
  useEffect(() => {
    if (reduced) return;
    opacity.set(withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0.55, { duration: 700 })), -1));
  }, [opacity, reduced]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View
      accessibilityLabel="Loading"
      style={[{ height, borderRadius: radius.lg, backgroundColor: p.fill }, animated, style]}
    />
  );
}

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  const p = useTheme();
  return (
    <View style={{ alignItems: "center", paddingVertical: 40, paddingHorizontal: 24, gap: 10 }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: p.fill, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={26} color={p.ink3} />
      </View>
      <T variant="headline" style={{ textAlign: "center" }}>
        {title}
      </T>
      {body ? (
        <T variant="callout" tone="ink3" style={{ textAlign: "center", maxWidth: 300 }}>
          {body}
        </T>
      ) : null}
      {action}
    </View>
  );
}

export function Failed({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <Empty
      icon="refresh"
      title="Couldn't load this"
      body={message ?? "Check your connection, then try again."}
      action={<Button label="Try again" variant="secondary" onPress={onRetry} style={{ marginTop: 6 }} />}
    />
  );
}

/** A themed on/off switch: the knob springs across, and it can be grabbed mid-way by tapping again. */
export function Toggle({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  const p = useTheme();
  const x = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    x.set(withSpring(value ? 1 : 0, { damping: 20, stiffness: 320 }));
  }, [value, x]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() * 20 }] }));
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => {
        if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
        onChange(!value);
      }}
      style={{
        width: 50,
        height: 30,
        borderRadius: 15,
        padding: 3,
        backgroundColor: value ? p.accent : p.line,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Animated.View
        style={[
          {
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: value ? p.onAccent : p.surface,
            shadowColor: "#000",
            shadowOpacity: 0.18,
            shadowRadius: 2,
            shadowOffset: { width: 0, height: 1 },
            elevation: 2,
          },
          knob,
        ]}
      />
    </Pressable>
  );
}
