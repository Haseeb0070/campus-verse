import {
  advanceEngine,
  characterOf,
  createAvatarEngine,
  engineFrame,
  readAvatarLibrary,
  renderCharacterFrame,
  seedOfName,
  setEngineFace,
  setEngineLookAt,
  setEngineState,
  type AvatarCharacter,
} from "@bible-strong/avatar-core";
import { useIsFocused } from "expo-router";
import { type Ref, useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { ClipPath, Defs, G, Path } from "react-native-svg";
import { useTheme } from "@/theme";
import file from "./verse.avatar.json";

/*
 * Verse, drawn natively. The avatar engine (@bible-strong/avatar-core, the same one the website
 * uses) works out its shapes; react-native-svg draws them.
 *
 * Working the shapes out is heavy for a phone (about 23 KB of path per frame), so Verse is never
 * redrawn frame by frame. Each pose (a state, a face, where it looks) is worked out once, kept, and
 * faded in over the last one. Everything that moves (the breath, hops, nods) is a transform that
 * runs on the UI thread, so it stays smooth whatever JavaScript is doing.
 */

/** Calm states of our own: the catalogue's "idle" spins all the way round now and then. */
const LIBRARY = readAvatarLibrary({
  clips: [],
  faces: [],
  states: [
    { name: "calm", clips: ["Idle_B", "Idle_D", "Idle_B"] },
    { name: "attentive", clips: ["Idle_D"], face: "inspecting" },
  ],
}).library;

/** Room drawn round Verse, as a share of its size, so a tilted cap or tassel is never cut off. */
const PAD = 0.3;
const VIEW = 150 * (1 + PAD);
/** Small looks round about, now and then, when nothing else is going on. */
const GLANCES: readonly (readonly [number, number])[] = [
  [-0.35, 0.1],
  [0.35, 0.1],
  [0, -0.3],
  [0.2, 0.3],
  [-0.2, 0.3],
  [0, 0],
];
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** How Verse greets a change of mood with its body, since the poses themselves don't move. */
const MOOD_GESTURE: Record<string, Gesture | "tilt"> = {
  excited: "bounce",
  celebrate: "bounce",
  happy: "nod",
  proud: "nod",
  approving: "nod",
  surprised: "bounce",
  scared: "bounce",
  curious: "tilt",
  confused: "tilt",
  listening: "tilt",
};

/** A new pose fades in over the last for this long. */
const FADE_MS = 170;

export type Gesture = "bounce" | "nod" | "spin";

export type VerseHandle = {
  /** A hop, a nod or a little twirl, on top of whatever Verse is doing. */
  poke: (gesture: Gesture, turns?: number) => void;
};

export type VerseProps = {
  ref?: Ref<VerseHandle>;
  size: number;
  /** A state of the catalogue's, or "calm" / "attentive". */
  state?: string;
  /** A face to hold, whatever the state shows. */
  face?: string | null;
  /** Where to look, [right, up], each -1 to 1; null looks ahead. */
  lookAt?: readonly [number, number] | null;
  /** Breathe gently while idle (the default). Off for Verses that sit in a crowded place. */
  breathe?: boolean;
  /** The outline's colour: the background Verse sits on. */
  outline?: string;
  /** No longer used: Verse never redraws itself frame by frame now. Kept so callers still compile. */
  settleAfterMs?: number;
};

type Scene = ReturnType<typeof renderCharacterFrame>;

/* ---------- Characters and poses, shared by every Verse on screen ---------- */

const CHARACTERS = new Map<string, AvatarCharacter>();

function useCharacter(): { character: AvatarCharacter; key: string } {
  const g = useTheme().guide;
  return useMemo(() => {
    const key = [g.name, g.body, g.cap, g.tassel].join("|");
    let character = CHARACTERS.get(key);
    if (!character) {
      const [base, board, tassel] = file.body.nodes;
      character = characterOf({
        ...file,
        name: g.name,
        colors: { ...file.colors, body: g.body },
        body: {
          ...file.body,
          nodes: [
            { ...base, color: g.cap },
            { ...board, color: g.cap },
            { ...tassel, color: g.tassel },
          ],
        },
      });
      CHARACTERS.set(key, character);
    }
    return { character, key };
  }, [g.name, g.body, g.cap, g.tassel]);
}

const POSES = new Map<string, Scene>();
const MAX_POSES = 96;

/** Where to look, rounded, so a look that barely moved reuses the pose already drawn. */
const step = (v: number) => Math.round(v * 6) / 6;

function poseOf(character: AvatarCharacter, characterKey: string, state: string, face: string | null, look: readonly [number, number] | null): Scene {
  const key = `${characterKey}|${state}|${face ?? ""}|${look ? `${look[0]},${look[1]}` : ""}`;
  const known = POSES.get(key);
  if (known) {
    // Most recently used last, so the oldest goes first.
    POSES.delete(key);
    POSES.set(key, known);
    return known;
  }
  const engine = createAvatarEngine({ seed: seedOfName(character.name ?? "Verse"), compact: false, ...LIBRARY });
  setEngineState(engine, state);
  setEngineFace(engine, face);
  setEngineLookAt(engine, look ? [look[0], look[1]] : null);
  // Let the state, face and head turn arrive.
  for (let i = 0; i < 30; i += 1) advanceEngine(engine, 0.06);
  const scene = renderCharacterFrame(character, engineFrame(engine));
  if (POSES.size >= MAX_POSES) POSES.delete(POSES.keys().next().value!);
  POSES.set(key, scene);
  return scene;
}

/* ---------- Verse ---------- */

export function Verse({ ref, size, state = "calm", face = null, lookAt = null, breathe = true, outline }: VerseProps) {
  const { character, key } = useCharacter();
  const reduced = useReducedMotion();
  const focused = useIsFocused();
  const lively = !reduced && focused;

  // A glance round about, now and then, while what it looks at stays the same.
  const lookKey = lookAt ? `${step(lookAt[0])},${step(lookAt[1])}` : "ahead";
  const [glance, setGlance] = useState<{ for: string; at: readonly [number, number] }>({ for: lookKey, at: [0, 0] });
  useEffect(() => {
    if (!lively) return;
    let t: ReturnType<typeof setTimeout>;
    const next = () => {
      t = setTimeout(() => {
        setGlance({ for: lookKey, at: GLANCES[Math.floor(Math.random() * GLANCES.length)] });
        next();
      }, rand(3200, 6500));
    };
    next();
    return () => clearTimeout(t);
  }, [lively, lookKey]);
  const [gx, gy] = glance.for === lookKey ? glance.at : [0, 0];
  const lx = lookAt || gx || gy ? step(Math.max(-1, Math.min(1, (lookAt?.[0] ?? 0) + gx))) : null;
  const ly = lookAt || gx || gy ? step(Math.max(-1, Math.min(1, (lookAt?.[1] ?? 0) + gy))) : null;
  const look = useMemo(() => (lx === null || ly === null ? null : ([lx, ly] as const)), [lx, ly]);
  const scene = useMemo(() => poseOf(character, key, state, face, look), [character, key, state, face, look]);
  // The same pose with its eyes shut, laid on top for a blink. None when a face is held.
  const blinkScene = useMemo(
    () => (face || !lively ? null : poseOf(character, key, state, "squinted", look)),
    [character, key, state, face, look, lively],
  );

  // The pose before this one stays underneath while the new one fades in.
  const [layers, setLayers] = useState({ back: scene, front: scene, n: 0 });
  if (layers.front !== scene) setLayers({ back: layers.front, front: scene, n: layers.n + 1 });
  // Once it has faded in, the old pose goes, so none of its outline lingers behind the new one.
  useEffect(() => {
    if (layers.back === layers.front) return;
    const t = setTimeout(() => setLayers((l) => (l.n === layers.n ? { ...l, back: l.front } : l)), FADE_MS + 40);
    return () => clearTimeout(t);
  }, [layers]);

  // Motion, all on the UI thread.
  const hop = useSharedValue(0);
  const squash = useSharedValue(0);
  const nod = useSharedValue(0);
  const twirl = useSharedValue(0);
  const breath = useSharedValue(0);
  const sway = useSharedValue(0);
  const tilt = useSharedValue(0);
  const blink = useSharedValue(0);

  useEffect(() => {
    if (reduced || !breathe) {
      cancelAnimation(breath);
      breath.value = 0;
      return;
    }
    breath.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }), -1, true);
    sway.value = withRepeat(withTiming(1, { duration: 2700, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => {
      cancelAnimation(breath);
      cancelAnimation(sway);
    };
  }, [reduced, breathe, breath, sway]);

  // A blink every few seconds.
  useEffect(() => {
    if (!blinkScene) return;
    let t: ReturnType<typeof setTimeout>;
    const next = () => {
      t = setTimeout(() => {
        blink.value = withSequence(withTiming(1, { duration: 55 }), withDelay(90, withTiming(0, { duration: 70 })));
        next();
      }, rand(2400, 5200));
    };
    next();
    return () => clearTimeout(t);
  }, [blinkScene, blink]);

  const poke = useCallback(
    (gesture: Gesture | "tilt") => {
        if (reduced) return;
        if (gesture === "tilt") {
          // A curious head tilt, held a moment.
          tilt.set(withSequence(
            withSpring(1, { damping: 10, stiffness: 180 }),
            withDelay(700, withSpring(0, { damping: 12, stiffness: 140 })),
          ));
          return;
        }
        if (gesture === "nod") {
          nod.set(withSequence(
            withTiming(1, { duration: 140, easing: Easing.out(Easing.quad) }),
            withTiming(-0.35, { duration: 160, easing: Easing.inOut(Easing.quad) }),
            withSpring(0, { damping: 12, stiffness: 220 }),
          ));
          return;
        }
        if (gesture === "spin") {
          twirl.set(0);
          twirl.set(withTiming(1, { duration: 520, easing: Easing.inOut(Easing.cubic) }));
        }
        // A hop: crouch, spring up, land with a little squash.
        squash.set(withSequence(
          withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) }),
          withTiming(-0.6, { duration: 140 }),
          withTiming(0.7, { duration: 110 }),
          withSpring(0, { damping: 9, stiffness: 260 }),
        ));
        hop.set(withSequence(
          withTiming(0, { duration: 90 }),
          withTiming(-size * 0.22, { duration: 180, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 170, easing: Easing.in(Easing.quad) }),
        ));
    },
    [reduced, size, hop, squash, nod, twirl, tilt],
  );
  useImperativeHandle(ref, () => ({ poke }), [poke]);

  // A change of mood shows in the body too: a hop for excitement, a nod for pride, a tilt for curiosity.
  const firstState = useRef(true);
  useEffect(() => {
    // Only when the mood changes, not on first showing.
    if (firstState.current) {
      firstState.current = false;
      return;
    }
    const g = MOOD_GESTURE[state];
    if (g) poke(g);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const body = useAnimatedStyle(() => {
    const s = squash.value * 0.1;
    const b = breath.value * 0.04;
    return {
      transform: [
        { translateY: hop.value - breath.value * size * 0.02 },
        { rotate: `${nod.value * 8 + (sway.value - 0.5) * 3.6 + tilt.value * 11}deg` },
        { scaleX: (1 + s) * (1 - b * 0.4) },
        { scaleY: (1 - s) * (1 + b) },
      ],
    };
  });
  const blinkStyle = useAnimatedStyle(() => ({ opacity: blink.value }));
  const spin = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.cos(twirl.value * Math.PI * 2) }] }));

  const drawn = size * (1 + PAD);
  const offset = -(drawn - size) / 2;

  return (
    <View pointerEvents="none" style={{ width: size, height: size }}>
      <Animated.View style={[{ position: "absolute", left: offset, top: offset, width: drawn, height: drawn, transformOrigin: "50% 80%" }, body]}>
        <Animated.View style={[StyleSheet.absoluteFill, spin]}>
          {layers.back !== layers.front ? <Pose scene={layers.back} character={character} size={drawn} outline={outline} /> : null}
          <Animated.View key={layers.n} entering={reduced || layers.n === 0 ? undefined : FadeIn.duration(FADE_MS)} style={StyleSheet.absoluteFill}>
            <Pose scene={layers.front} character={character} size={drawn} outline={outline} />
          </Animated.View>
          {blinkScene ? (
            <Animated.View style={[StyleSheet.absoluteFill, blinkStyle]}>
              <Pose scene={blinkScene} character={character} size={drawn} outline={outline} />
            </Animated.View>
          ) : null}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/** One pose, drawn. */
function Pose({ scene, character, size, outline }: { scene: Scene; character: AvatarCharacter; size: number; outline?: string }) {
  const p = useTheme();
  const clip = useId().replace(/:/g, "");
  const { geometry: g, colors, bodyColors, transform } = scene;
  const parts = Array.from({ length: character.body.nodes.length + 2 }, (_, i) => i);
  const line = character.style?.outline?.enabled ? character.style.outline : null;

  return (
    <Svg width={size} height={size} viewBox={`${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`} style={StyleSheet.absoluteFill}>
      <Defs>
        <ClipPath id={`${clip}-head`}>
          <Path d={g.headPath} />
        </ClipPath>
        {parts.map((i) =>
          g.frontClipPaths[i] ? (
            <ClipPath key={i} id={`${clip}-front-${i}`}>
              <Path d={g.frontClipPaths[i]} />
            </ClipPath>
          ) : null,
        )}
      </Defs>
      <G transform={`matrix(${transform.join(",")})`} opacity={scene.opacity}>
        {line ? (
          <G fill="none" stroke={outline ?? p.bg} strokeWidth={line.width * 2} strokeLinejoin="round" opacity={line.opacity}>
            {parts.map((i) => (g.backPaths[i] ? <Path key={`ob${i}`} d={g.backPaths[i]} /> : null))}
            <Path d={g.headPath} />
            {parts.map((i) => (g.frontPaths[i] ? <Path key={`of${i}`} d={g.frontPaths[i]} /> : null))}
          </G>
        ) : null}
        {parts.map((i) => (g.backPaths[i] ? <Path key={`b${i}`} d={g.backPaths[i]} fill={bodyColors.back[i] ?? colors.body} /> : null))}
        <Path d={g.headPath} fill={colors.body} />
        <G clipPath={`url(#${clip}-head)`} fill={colors.eyes}>
          {g.leftVisible && g.leftPath ? <Path d={g.leftPath} /> : null}
          {g.rightVisible && g.rightPath ? <Path d={g.rightPath} /> : null}
          {g.nosePath ? <Path d={g.nosePath} /> : null}
          {g.mouthPath ? <Path d={g.mouthPath} /> : null}
        </G>
        {parts.map((i) =>
          g.frontPaths[i] ? (
            <Path
              key={`f${i}`}
              d={g.frontPaths[i]}
              fill={bodyColors.front[i] ?? colors.body}
              clipPath={g.frontClipPaths[i] ? `url(#${clip}-front-${i})` : undefined}
            />
          ) : null,
        )}
      </G>
    </Svg>
  );
}
