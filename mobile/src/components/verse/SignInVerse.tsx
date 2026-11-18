import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { useTheme } from "@/theme";
import { Verse } from "./Verse";

/*
 * Verse on the sign-in card. It peeks over the card's top edge and watches you fill it in:
 *   - email: it reads along the field, its eyes following the end of what you type;
 *   - password: it won't look. It turns its head away, squeezes its eyes shut and ducks down behind
 *     the card until only its cap shows, giving a little shiver at each key ("not looking!");
 *   - signing in: it thinks; a wrong password: it pops back up, confused.
 * The admin's switch for the guide on the signed-out pages (Manage → Theme) hides it.
 */

const SIZE = 76;
/** How much of Verse shows over the card: the cap and the eyes. */
export const SIGN_IN_PEEK = 52;
const SINK = SIZE - SIGN_IN_PEEK;
/** Ducked for the password, only the cap is left above the edge. */
const DUCK = 30;
/** Roughly how wide a character is in a field (16px Plus Jakarta Sans). */
const CHAR = 8.2;

export type SignInVerseProps = {
  /** Which field has focus. */
  field: "email" | "password" | "other" | null;
  /** What is in the email field, for its eyes to follow. */
  email: string;
  /** How long the password is: each new key gets a shiver, never a look. */
  passwordLength: number;
  busy: boolean;
  error: boolean;
};

export function SignInVerse({ field, email, passwordLength, busy, error }: SignInVerseProps) {
  const p = useTheme();
  const reduced = useReducedMotion();
  const y = useSharedValue(0);
  const jolt = useSharedValue(0);
  const x = useSharedValue(0);
  const tilt = useSharedValue(0);
  const [width, setWidth] = useState(0);

  const hiding = field === "password" && !error;

  useEffect(() => {
    const spring = { damping: 15, stiffness: 200 };
    y.value = reduced ? (hiding ? DUCK : 0) : withSpring(hiding ? DUCK : 0, spring);
    tilt.value = reduced ? (hiding ? 10 : 0) : withSpring(hiding ? 10 : 0, spring);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiding, reduced]);

  // A shiver at each key of the password: it heard that, and it is still not looking.
  useEffect(() => {
    if (!hiding || reduced || passwordLength === 0) return;
    x.value = withSequence(
      withTiming(-2.5, { duration: 45 }),
      withTiming(2.5, { duration: 70 }),
      withTiming(0, { duration: 45 }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passwordLength]);

  // A wrong password: it pops up with a start.
  useEffect(() => {
    if (!error || reduced) return;
    jolt.value = withSequence(withSpring(-8, { damping: 8, stiffness: 500 }), withSpring(0, { damping: 12, stiffness: 240 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value + jolt.value }, { rotate: `${tilt.value}deg` }],
  }));

  if (!p.guide.signedOut) return null;

  // Verse stands near the card's right edge; the fields start 20px in from the left.
  const centre = width - 28 - SIZE / 2;
  const caret = 20 + 14 + email.length * CHAR;
  const readX = width ? Math.max(-1, Math.min(0.4, (Math.min(caret, width - 40) - centre) / (width * 0.6))) : -0.5;

  const lookAt: [number, number] | null = hiding
    ? [0.95, 0.35] // as far from the password as it can turn
    : field === "email"
      ? [readX, -0.85]
      : busy
        ? [0.3, 0.7]
        : error
          ? [-0.4, -0.5]
          : field === "other"
            ? [-0.4, -0.8]
            : null;
  const state = hiding ? "shy" : error ? "confused" : busy ? "thinking" : field ? "attentive" : "calm";
  const face = hiding ? "squinted" : null;

  return (
    <View pointerEvents="none" style={styles.anchor} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Animated.View
        accessible
        accessibilityLabel={hiding ? `${p.guide.name} is looking away while you type your password` : `${p.guide.name}, your guide`}
        style={[styles.verse, style]}
      >
        <Verse size={SIZE} state={state} face={face} lookAt={lookAt} outline={p.field} settleAfterMs={2500} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // A line along the card's top edge; Verse stands on it, the rest of it behind the card.
  anchor: { height: 0, overflow: "visible", marginTop: SIGN_IN_PEEK },
  verse: { position: "absolute", right: 28, bottom: -SINK, width: SIZE, height: SIZE },
});
