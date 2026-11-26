import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  ZoomIn,
} from "react-native-reanimated";
import { radius, useTheme } from "@/theme";
import { Icon } from "./Icon";
import { T } from "./ui";

const PIECES = 14;

function Piece({ i, colour }: { i: number; colour: string }) {
  const t = useSharedValue(0);
  const angle = (i / PIECES) * Math.PI * 2 + (i % 2 ? 0.2 : -0.1);
  const dist = 90 + (i % 3) * 28;
  useEffect(() => {
    t.value = withDelay((i % 4) * 25, withTiming(1, { duration: 950, easing: Easing.out(Easing.cubic) }));
  }, [i, t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.3 ? t.value / 0.3 : 1 - (t.value - 0.3) / 0.7,
    transform: [
      { translateX: Math.cos(angle) * dist * t.value },
      { translateY: Math.sin(angle) * dist * t.value },
      { rotate: `${(i % 2 ? 1 : -1) * (120 + i * 17) * t.value}deg` },
      { scale: 0.4 + 0.6 * t.value },
    ],
  }));
  return <Animated.View style={[{ position: "absolute", width: 10, height: 10, borderRadius: 3, backgroundColor: colour }, style]} />;
}

/**
 * Peak-end rule: handing in work ends on a small, warm moment. A check pops, a few pieces of
 * confetti fly out and the phone gives a success buzz; about 1.6 seconds, then it's gone.
 * Reduced motion keeps the check and the buzz only.
 */
export function Celebrate({ message, onDone }: { message: string; onDone: () => void }) {
  const p = useTheme();
  const reduce = useReducedMotion();
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const timer = setTimeout(() => done.current(), 1600);
    return () => clearTimeout(timer);
  }, []);
  const colours = [p.accent, p.accentInk, "#e3a33b", "#4fb3a0", p.active];

  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      {!reduce && Array.from({ length: PIECES }, (_, i) => <Piece key={i} i={i} colour={colours[i % colours.length]} />)}
      <Animated.View entering={ZoomIn.springify().damping(12)} exiting={FadeOut.duration(200)}
        accessibilityRole="alert" accessibilityLabel={message}
        style={{ alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 18, borderRadius: radius.xl, backgroundColor: p.surface,
          shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: p.success, alignItems: "center", justifyContent: "center" }}>
          <Icon name="check" size={30} color="#fff" />
        </View>
        <T variant="headline">{message}</T>
      </Animated.View>
    </View>
  );
}

type CelebrateListener = (message: string) => void;
const celebrateListeners = new Set<CelebrateListener>();

/** Plays the celebration over the whole app (CelebrateHost shows it). */
export function celebrate(message: string) {
  celebrateListeners.forEach((l) => l(message));
}

/** Mounted once at the root, so the celebration covers the screen wherever it was called. */
export function CelebrateHost() {
  const [shown, setShown] = useState<{ id: number; message: string } | null>(null);
  useEffect(() => {
    let n = 0;
    const l: CelebrateListener = (message) => setShown({ id: ++n, message });
    celebrateListeners.add(l);
    return () => {
      celebrateListeners.delete(l);
    };
  }, []);
  return shown ? <Celebrate key={shown.id} message={shown.message} onDone={() => setShown(null)} /> : null;
}
