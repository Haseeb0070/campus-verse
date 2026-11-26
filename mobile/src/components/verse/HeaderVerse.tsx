import * as Haptics from "expo-haptics";
import { useIsFocused } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useTheme } from "@/theme";
import { AskVerse } from "./AskVerse";
import { type Gesture, Verse, type VerseHandle } from "./Verse";

/*
 * Verse at the end of each tab's title (see Screen). It has its own place in the title's row, so a
 * long title wraps before it and it never sits on text. It keeps busy:
 *   - opening the tab: a hop hello;
 *   - every few seconds a little something: a look at the title, a look at you, a hop, a nod, a
 *     head tilt, now and then a twirl;
 *   - a new notification: a jump, then it keeps glancing over at the bell until they're read;
 *   - tapped: a happy reaction (a different one each time) and a buzz, and, when the admins have
 *     the guide on in the app (Manage → Theme), it asks what you want to know (AskVerse).
 */

export const HEADER_VERSE = 48;

type Trick = { gesture?: Gesture | "tilt"; look?: [number, number]; state?: string; ms: number };

/** The little things it does on its own. Looks: at the title (left), at you (ahead), up, at the buttons. */
const TRICKS: Trick[] = [
  { look: [-0.85, -0.25], ms: 2200 },
  { look: [0, 0], state: "happy", ms: 1800 },
  { gesture: "bounce", ms: 900 },
  { gesture: "nod", look: [-0.6, -0.2], ms: 1200 },
  { gesture: "tilt", look: [0.1, 0.2], state: "curious", ms: 1600 },
  { look: [0.4, 0.75], ms: 1700 },
  { look: [0.9, 0], ms: 1500 },
  { gesture: "spin", state: "playful", ms: 1200 },
];
const TAPS: Trick[] = [
  { gesture: "bounce", state: "happy", look: [0, 0], ms: 1500 },
  { gesture: "spin", state: "laughing", look: [0, 0], ms: 1600 },
  { gesture: "tilt", state: "shy", look: [0.3, -0.3], ms: 1600 },
  { gesture: "bounce", state: "excited", look: [0, 0.4], ms: 1500 },
];

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function HeaderVerse({ mood = "calm", unread }: { mood?: string; unread: number }) {
  const p = useTheme();
  const reduced = useReducedMotion();
  const focused = useIsFocused();
  const verse = useRef<VerseHandle>(null);
  const [trick, setTrick] = useState<Trick | null>(null);
  const until = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const taps = useRef(0);
  const [asking, setAsking] = useState(false);

  const play = (t: Trick) => {
    clearTimeout(until.current);
    setTrick(t);
    if (t.gesture) verse.current?.poke(t.gesture as Gesture);
    until.current = setTimeout(() => setTrick(null), t.ms);
  };
  useEffect(() => () => clearTimeout(until.current), []);

  // A hop hello each time the tab comes into view.
  useEffect(() => {
    if (!focused || reduced) return;
    const t = setTimeout(() => play({ gesture: "bounce", look: [0, 0], state: "happy", ms: 1400 }), 250);
    return () => clearTimeout(t);
  }, [focused, reduced]);

  // Something small every few seconds while the tab is in view.
  useEffect(() => {
    if (!focused || reduced) return;
    let t: ReturnType<typeof setTimeout>;
    const next = () => {
      t = setTimeout(() => {
        // While there are unread notifications, every other trick is a look over at the bell.
        const pick =
          unread && Math.random() < 0.5
            ? { look: [1, -0.1] as [number, number], gesture: "nod" as const, ms: 1500 }
            : TRICKS[Math.floor(Math.random() * TRICKS.length)];
        if (pick.gesture === "spin" && Math.random() < 0.6) return next(); // twirls stay rare
        play(pick);
        next();
      }, rand(3800, 7000));
    };
    next();
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, reduced, unread > 0]);

  // A new notification: a jump and a look over at the bell.
  const last = useRef(unread);
  useEffect(() => {
    if (unread > last.current) play({ gesture: "bounce", look: [1, -0.1], state: "excited", ms: 2200 });
    last.current = unread;
  }, [unread]);

  const state = trick?.state ?? mood;
  const lookAt: [number, number] = trick?.look ?? [-0.7, -0.2]; // otherwise it reads the title

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${p.guide.name}, your guide`}
        accessibilityHint={p.guide.inApp ? "Asks what you want to know" : "Says hello"}
        hitSlop={8}
        onPress={() => {
          play(TAPS[taps.current++ % TAPS.length]);
          Haptics.selectionAsync().catch(() => {});
          if (p.guide.inApp) setAsking(true);
        }}
        // Standing on the title's baseline rather than below its descenders.
        style={{ width: HEADER_VERSE, height: HEADER_VERSE, marginBottom: 4 }}
      >
        <Verse ref={verse} size={HEADER_VERSE} state={state} lookAt={lookAt} />
      </Pressable>
      {p.guide.inApp ? (
        <AskVerse
          visible={asking}
          onClose={() => setAsking(false)}
          onAnswer={(a) => play({ gesture: "bounce", state: a.mood ?? "happy", look: [0, 0], ms: 2000 })}
        />
      ) : null}
    </>
  );
}
