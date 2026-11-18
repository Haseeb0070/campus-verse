import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { LogoGlyph } from "@/components/Logo";
import { intro, type Spot } from "@/lib/intro";
import { useTheme } from "@/theme";

/** Verse is drawn at this size and scaled. */
const SIZE = 168;
/** The native splash shows Verse 96px wide (imageWidth in app.json), so the first frame matches it. */
const SPLASH_SCALE = 96 / SIZE;
/** The native splash's background (expo-splash-screen backgroundColor in app.json). */
const SPLASH_COLOUR = "#b4532a";
/** The sign-in tile and the glyph inside it (src/app/sign-in.tsx). */
const TILE = 44;
const TILE_RADIUS = 12;
const TILE_GLYPH = 36;

const out = Easing.out(Easing.quad);
const inn = Easing.in(Easing.quad);
const settle = Easing.out(Easing.back(2.2));
const t = (to: number, duration: number, easing = out) => withTiming(to, { duration, easing });

/** The opening: Verse hops out of the splash, bounces three times, then takes one big jump into the
 *  sign-in screen's logo tile while the splash colour shrinks down to that tile. Tap to skip. */
export function Intro() {
  const site = useTheme();
  const reduced = useReducedMotion();
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [show, setShow] = useState(() => !intro.played && !reduced);

  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const scale = useSharedValue(SPLASH_SCALE);
  const squash = useSharedValue(0); // + is wide and short, - is tall and thin
  const shadow = useSharedValue(0);
  const tint = useSharedValue(0);
  const shrink = useSharedValue(0);
  const fade = useSharedValue(1);
  const rect = useSharedValue<Spot>({ x: 0, y: 0, width: W, height: H });

  useEffect(() => {
    if (!show) {
      intro.played = true;
      return;
    }
    intro.start();
    const bump = (style: Haptics.ImpactFeedbackStyle) => {
      if (Platform.OS !== "web") Haptics.impactAsync(style).catch(() => {});
    };
    const landed = (strong: boolean) =>
      bump(strong ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    const done = () => {
      intro.finish();
      setShow(false);
    };

    // The big jump, aimed at wherever the sign-in screen put its tile. Each phase starts when the
    // one before it ends (not on a timer), so a slow frame can't cut the jump short.
    const jump = () => {
      const target = intro.spot() ?? {
        x: (W - Math.min(W, 520)) / 2 + 24,
        y: insets.top + 40,
        width: TILE,
        height: TILE,
      };
      rect.value = target;
      const dx = target.x + target.width / 2 - W / 2;
      const dy = target.y + target.height / 2 - H / 2;
      const glide = { duration: 620, easing: Easing.inOut(Easing.quad) };
      shadow.value = t(0, 200);
      x.value = withDelay(120, withTiming(dx, glide));
      scale.value = withDelay(120, withTiming(TILE_GLYPH / SIZE, glide));
      y.value = withSequence(
        withDelay(120, t(Math.min(dy, 0) - 110, 280)),
        withTiming(dy, { duration: 340, easing: inn }, (ok) => {
          if (ok) scheduleOnRN(landed, true);
        }),
      );
      shrink.value = withDelay(300, withTiming(1, { duration: 460, easing: Easing.inOut(Easing.cubic) }));
      squash.value = withSequence(
        t(0.2, 120), // crouch
        t(-0.14, 160), // stretch on the way up
        t(0, 300),
        withDelay(160, t(0.18, 60)), // lands in the tile
        withTiming(0, { duration: 200, easing: settle }, (ok) => {
          if (ok) scheduleOnRN(done);
        }),
      );
    };

    const land = (to: number, ms: number, then?: () => void) =>
      withTiming(to, { duration: ms, easing: inn }, (ok) => {
        if (!ok) return;
        scheduleOnRN(landed, false);
        if (then) scheduleOnRN(then);
      });

    tint.value = t(1, 500);
    // Out of the splash and up to full size, then three bounces, each smaller.
    scale.value = withDelay(270, t(1, 380));
    shadow.value = withDelay(270, t(1, 380));
    y.value = withSequence(
      withDelay(270, t(-170, 380)),
      land(0, 300),
      withDelay(230, t(-70, 220)),
      land(0, 200),
      withDelay(180, t(-26, 140)),
      land(0, 130, jump),
    );
    squash.value = withSequence(
      withDelay(150, t(0.16, 120)), // crouch
      t(-0.12, 140), // stretch on the way up
      t(0, 240),
      withDelay(260, t(-0.06, 40)),
      t(0.28, 70), // first landing
      t(0, 220, settle),
      withDelay(300, t(0.16, 60)), // second
      t(0, 180, settle),
      withDelay(270, t(0.1, 50)), // third
    );
    // Plays once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function skip() {
    [x, y, scale, squash, shrink, shadow].forEach((v) => cancelAnimation(v));
    fade.value = withTiming(0, { duration: 200 }, (ok) => {
      if (ok) scheduleOnRN(finishNow);
    });
  }
  function finishNow() {
    intro.finish();
    setShow(false);
  }

  const ground = useAnimatedStyle(() => {
    const r = rect.value;
    const p = shrink.value;
    return {
      left: r.x * p,
      top: r.y * p,
      width: W + (r.width - W) * p,
      height: H + (r.height - H) * p,
      borderRadius: TILE_RADIUS * p,
      backgroundColor: interpolateColor(tint.value, [0, 1], [SPLASH_COLOUR, site.accent]),
    };
  });
  const body = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));
  const squashStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: 1 + squash.value }, { scaleY: 1 - squash.value }],
  }));
  const shadowStyle = useAnimatedStyle(() => ({
    opacity: shadow.value * interpolate(y.value, [-170, 0], [0.08, 0.22], "clamp"),
    transform: [{ scaleX: interpolate(y.value, [-170, 0], [0.5, 1], "clamp") }],
  }));
  const all = useAnimatedStyle(() => ({ opacity: fade.value }));

  if (!show) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, all]}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={skip}
        accessibilityRole="button"
        accessibilityLabel="Skip the intro"
      >
        <Animated.View style={[{ position: "absolute" }, ground]} />
        <Animated.View
          style={[
            {
              position: "absolute",
              left: W / 2 - 52,
              top: H / 2 + SIZE / 2 - 10,
              width: 104,
              height: 18,
              borderRadius: 9,
              backgroundColor: "#000",
            },
            shadowStyle,
          ]}
        />
        <Animated.View
          style={[{ position: "absolute", left: W / 2 - SIZE / 2, top: H / 2 - SIZE / 2 }, body]}
        >
          <Animated.View style={[{ transformOrigin: "50% 100%" }, squashStyle]}>
            <View>
              <LogoGlyph size={SIZE} color={site.onAccent} />
            </View>
          </Animated.View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}
