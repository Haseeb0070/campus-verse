import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "@/theme";
import { Verse, type VerseHandle } from "./Verse";

/*
 * Verse in a chat. It peeks over the top edge of the composer from the right-hand corner, the rest
 * of it tucked behind the composer, and keeps to a strip the message list leaves free for it
 * (PEEK), so it never sits over a message:
 *   - typing: it leans in and reads along the field, its eyes following the end of the text;
 *   - sending: a hop, and it watches the message go up;
 *   - a new message: it slides along its strip to the left, under the message, and looks up at it,
 *     then wanders back to its corner;
 *   - someone typing: it looks up the chat, listening;
 *   - scrolled up into older messages: it ducks down behind the composer out of the way.
 * Tapped, it nods and smiles. The admin's switch (Manage → Theme → In-app helper) hides it.
 */

/** Verse's drawn size. */
const SIZE = 68;
/** How much of Verse shows above the composer: the cap and the eyes. */
export const PEEK = 48;
/** The rest is tucked behind the composer. */
const SINK = SIZE - PEEK;

/** Where the text field starts and ends across the composer (the attach and send buttons either side). */
const FIELD_LEFT = 12 + 44 + 8 + 16;
const FIELD_RIGHT = 12 + 44 + 8 + 16;
/** Roughly how wide a character is in the field (15px Plus Jakarta Sans). */
const CHAR = 7.6;

type Mood = "rest" | "typing" | "sent" | "incoming" | "listening";

export type ChatVerseProps = {
  /** The width Verse has to move in: the composer's. */
  width: number;
  /** The field has focus. */
  focused: boolean;
  /** What is in the field now. */
  text: string;
  /** Goes up by one each time a message is sent. */
  sent: number;
  /** Goes up by one each time someone else's message arrives. */
  received: number;
  /** Someone else is typing. */
  othersTyping: boolean;
  /** The list is scrolled away from the newest messages. */
  away: boolean;
};

export function ChatVerse({ width, focused, text, sent, received, othersTyping, away }: ChatVerseProps) {
  const p = useTheme();
  const reduced = useReducedMotion();
  const verse = useRef<VerseHandle>(null);
  const [event, setEvent] = useState<{ kind: "sent" | "incoming"; until: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const rest = width - SIZE * 0.62; // part of it hidden past the right edge, peeking round the corner
  const leanIn = width - SIZE - 6;
  const underIncoming = 40; // just right of the senders' initials

  const x = useSharedValue(rest);
  const lift = useSharedValue(0);
  const duck = useSharedValue(0);
  const tilt = useSharedValue(-12);

  const flash = (kind: "sent" | "incoming", ms: number) => {
    clearTimeout(timer.current);
    setEvent({ kind, until: Date.now() + ms });
    timer.current = setTimeout(() => setEvent(null), ms);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const lastSent = useRef(sent);
  useEffect(() => {
    if (sent > lastSent.current) {
      flash("sent", 1800);
      verse.current?.poke("nod");
      if (!reduced) lift.value = withSequence(withSpring(-12, { damping: 9, stiffness: 420 }), withSpring(0, { damping: 11, stiffness: 260 }));
    }
    lastSent.current = sent;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sent]);

  const lastReceived = useRef(received);
  useEffect(() => {
    if (received > lastReceived.current) flash("incoming", 3800);
    lastReceived.current = received;
  }, [received]);

  const mood: Mood = event?.kind === "incoming" ? "incoming" : event?.kind === "sent" ? "sent" : focused ? "typing" : othersTyping ? "listening" : "rest";

  // Where it goes and how it leans for each mood.
  const goal = mood === "incoming" ? underIncoming : mood === "typing" || mood === "sent" ? leanIn : rest;
  const lean = mood === "rest" || mood === "listening" ? -12 : mood === "incoming" ? 6 : 0;
  /** Travelling along the strip: -1 left, 1 right, 0 still. It looks where it's going. */
  const [moving, setMoving] = useState(0);
  const [lastGoal, setLastGoal] = useState(goal);
  if (goal !== lastGoal) {
    setLastGoal(goal);
    setMoving(!reduced && Math.abs(goal - lastGoal) > 30 ? (goal < lastGoal ? -1 : 1) : 0);
  }
  useEffect(() => {
    if (!moving) return;
    const t = setTimeout(() => setMoving(0), 900);
    return () => clearTimeout(t);
  }, [moving, goal]);
  useEffect(() => {
    const spring = { damping: 18, stiffness: Math.abs(x.value - goal) > 30 ? 90 : 160, mass: 1 };
    x.value = reduced ? goal : withSpring(goal, spring);
    tilt.value = reduced ? lean : withSpring(lean, { damping: 14, stiffness: 140 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal, lean, reduced]);

  useEffect(() => {
    duck.value = reduced ? (away ? SIZE : 0) : withTiming(away ? SIZE : 0, { duration: 260 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [away, reduced]);

  // Its eyes on the end of the text while typing: the caret moves right as the line fills.
  const lineWidth = Math.max(80, width - FIELD_LEFT - FIELD_RIGHT);
  const caret = FIELD_LEFT + ((text.split("\n").pop()?.length ?? 0) * CHAR) % lineWidth;
  const centre = leanIn + SIZE / 2;
  const readX = Math.max(-1, Math.min(0.2, (caret - centre) / (width * 0.55)));

  const lookAt: [number, number] | null = moving
    ? [moving * 0.9, 0.1]
    : mood === "typing"
      ? [readX, -0.85]
      : mood === "sent"
        ? [0.05, 1]
        : mood === "incoming"
          ? [-0.25, 0.95]
          : mood === "listening"
            ? [-0.7, 0.5]
            : [-0.55, 0.25];
  const state =
    mood === "sent" ? "happy" : mood === "incoming" ? (moving ? "curious" : "excited") : mood === "typing" ? "attentive" : mood === "listening" ? "listening" : "calm";

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: lift.value + duck.value }, { rotate: `${tilt.value}deg` }],
  }));

  return (
    <View pointerEvents="box-none" style={styles.anchor}>
      <Animated.View style={[styles.verse, style]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${p.guide.name}, your guide`}
          accessibilityHint="Says hello"
          disabled={away}
          onPress={() => {
            verse.current?.poke("bounce");
            flash("sent", 1400);
            Haptics.selectionAsync().catch(() => {});
          }}
        >
          <Verse ref={verse} size={SIZE} state={state} lookAt={lookAt} outline={p.surface} settleAfterMs={2500} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // A line along the composer's top edge; Verse stands on it, its lower part behind the composer.
  anchor: { height: 0, zIndex: 0, overflow: "visible" },
  verse: { position: "absolute", left: 0, bottom: -SINK, width: SIZE, height: SIZE },
});
