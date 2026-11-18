"use client";

import type { AvatarHandle } from "@bible-strong/avatar-react";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
  type RefObject,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import s from "./life.module.css";

/*
 * Life for Verse, the guide: what makes the character feel like a small creature rather than a
 * picture. Two parts, used by the landing page's guide and the app's helper alike.
 *
 * <Body> wraps the avatar in a little physical world. Its body is a set of springs (squash, lean,
 * sway) and a hop under gravity: it squashes before it jumps, stretches in the air, lands with a
 * jelly wobble, leans into its walk and droops its head asleep. Each act only adds velocity, so
 * acts stack and can interrupt each other without a jump in the picture. Above its head it shows
 * emotes: hearts, sparkles, Zzz, notes, "!", "?", a sweat drop, dizzy stars, confetti.
 *
 * useLife() is its temperament: it can be petted (stroke it with the pointer) and tickled dizzy
 * (tap it fast), dozes off when nobody is around and wakes with a start, flinches at a pointer
 * that rushes past, gasps at a fling of the page, and fidgets now and then when left alone.
 *
 * With reduced motion the body stays still and no emote is shown; the avatar keeps its faces.
 */

// ---------------------------------------------------------------------------------------------
// Body: springs and a hop

export type Act =
  | "hop"
  | "jump"
  | "land"
  | "jelly"
  | "perk"
  | "wiggle"
  | "sway"
  | "shiver"
  | "dizzy"
  | "flinch"
  | "stretch"
  | "pop";

export type Emote = "heart" | "sparkle" | "z" | "note" | "bang" | "ask" | "sweat" | "star" | "confetti";

export type BodyHandle = {
  act: (a: Act) => void;
  emote: (e: Emote, count?: number) => void;
};

type Spring = { x: number; v: number };

const GRAVITY = 2400; // px/s²

/** One step of a damped spring: `response` in seconds, `ratio` below 1 overshoots. */
function spring(sp: Spring, target: number, response: number, ratio: number, dt: number) {
  const w = (2 * Math.PI) / response;
  const a = -w * w * (sp.x - target) - 2 * ratio * w * sp.v;
  sp.v += a * dt;
  sp.x += sp.v * dt;
}

function createBody(el: HTMLElement, shadow: HTMLElement | null) {
  const squash: Spring = { x: 0, v: 0 }; // + is taller, - is flatter
  const tilt: Spring = { x: 0, v: 0 }; // degrees, + leans right
  const shift: Spring = { x: 0, v: 0 }; // px sideways
  let y = 0; // px, negative is up in the air
  let vy = 0;
  let squashTarget = 0;
  let lean = 0;
  let walking = false;
  let sleeping = false;
  let nextStep = 0;
  let shiverUntil = 0;
  let frame = 0;
  let last = 0;
  const timers = new Set<number>();

  const later = (ms: number, fn: () => void) => {
    const t = window.setTimeout(() => {
      timers.delete(t);
      fn();
      wake();
    }, ms);
    timers.add(t);
  };
  const airborne = () => y < 0 || vy < 0;
  const launch = (h: number) => {
    vy = -Math.sqrt(2 * GRAVITY * h);
    squash.v += 3; // stretch as it leaves the ground
  };
  const hop = (h: number) => {
    if (!airborne()) launch(h);
  };

  const draw = () => {
    const stretch = airborne() ? Math.min(0.16, Math.abs(vy) / 2600) : 0;
    const sy = Math.max(0.55, (1 + squash.x) * (1 + stretch));
    const sx = 1 / Math.sqrt(sy); // keeps its volume: flatter is wider
    el.style.transform = `translate3d(${shift.x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${tilt.x.toFixed(2)}deg) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
    if (shadow) {
      const lift = Math.min(1, -y / 50);
      shadow.style.transform = `translateX(-50%) scale(${((1 - lift * 0.45) * sx).toFixed(3)}, 1)`;
      shadow.style.opacity = (1 - lift * 0.6).toFixed(3);
    }
  };

  const tick = (now: number) => {
    const elapsed = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (walking && now >= nextStep && !airborne()) {
      launch(9); // a skip in its step
      nextStep = now + 290;
    }
    const target = walking ? lean : sleeping ? 7 : 0;
    const steps = Math.max(1, Math.ceil(elapsed * 120));
    const dt = elapsed / steps;
    for (let i = 0; i < steps; i++) {
      spring(squash, squashTarget, 0.28, 0.3, dt);
      spring(tilt, target, 0.45, 0.4, dt);
      spring(shift, 0, 0.3, 0.5, dt);
      if (now < shiverUntil) shift.v += (Math.random() - 0.5) * 14000 * dt;
      if (airborne()) {
        vy += GRAVITY * dt;
        y += vy * dt;
        if (y >= 0) {
          // Touch down: the fall turns into a squash, and a little wobble.
          y = 0;
          squash.v -= Math.min(7, vy / 105);
          tilt.v += (Math.random() - 0.5) * 50;
          vy = 0;
        }
      }
    }
    draw();
    const resting =
      !walking &&
      !airborne() &&
      now >= shiverUntil &&
      Math.abs(squash.x - squashTarget) < 0.001 &&
      Math.abs(squash.v) < 0.01 &&
      Math.abs(tilt.x - target) < 0.05 &&
      Math.abs(tilt.v) < 0.2 &&
      Math.abs(shift.x) < 0.05 &&
      Math.abs(shift.v) < 0.2;
    frame = resting ? 0 : requestAnimationFrame(tick);
  };

  function wake() {
    if (frame) return;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }

  const acts: Record<Act, () => void> = {
    hop: () => hop(13),
    jump: () => {
      if (airborne()) return;
      squashTarget = -0.15; // gather itself first
      later(120, () => {
        squashTarget = 0;
        launch(34);
      });
    },
    land: () => {
      squash.v -= 3.5;
    },
    jelly: () => {
      squash.v -= 5;
      tilt.v += (Math.random() - 0.5) * 140;
    },
    perk: () => {
      squash.v += 3.4;
    },
    wiggle: () => {
      [0, 110, 220, 330].forEach((ms, i) => later(ms, () => (tilt.v += (i % 2 ? -1 : 1) * 210)));
    },
    sway: () => {
      [0, 420, 840, 1260].forEach((ms, i) => later(ms, () => (tilt.v += (i % 2 ? -1 : 1) * 85)));
    },
    shiver: () => {
      shiverUntil = performance.now() + 650;
      squash.v -= 1.5;
    },
    dizzy: () => {
      hop(10);
      for (let i = 0; i < 9; i++) later(i * 150, () => (tilt.v += (i % 2 ? -1 : 1) * (280 - i * 26)));
    },
    flinch: () => {
      squash.v -= 4;
      tilt.v += (Math.random() < 0.5 ? -1 : 1) * 180;
      later(70, () => hop(11));
    },
    stretch: () => {
      squashTarget = 0.14; // up on its toes
      later(560, () => {
        squashTarget = 0;
        squash.v -= 3;
        tilt.v += 90;
      });
    },
    pop: () => {
      squash.x = -0.42;
      squash.v = 0;
      launch(18);
    },
  };

  return {
    act(a: Act) {
      acts[a]();
      wake();
    },
    setWalk(on: boolean, facing: 1 | -1) {
      if (on && !walking) nextStep = 0;
      walking = on;
      lean = facing * 8;
      wake();
    },
    setSleeping(on: boolean) {
      sleeping = on;
      wake();
    },
    destroy() {
      cancelAnimationFrame(frame);
      frame = 0;
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      el.style.transform = "";
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Emotes

type Bit = { id: number; kind: Emote; style: CSSProperties; glyph?: string };

const LIFE_MS: Record<Emote, number> = {
  heart: 1400,
  sparkle: 900,
  z: 2200,
  note: 1600,
  bang: 1100,
  ask: 1400,
  sweat: 1200,
  star: 1600,
  confetti: 1400,
};

const CONFETTI = ["var(--life-tassel)", "var(--life-body)", "var(--life-heart)", "var(--life-sky)", "var(--life-cap)"];

function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}

function bitsOf(kind: Emote, count: number, nextId: () => number): Bit[] {
  const out: Bit[] = [];
  const add = (style: Record<string, string | number>, glyph?: string) =>
    out.push({ id: nextId(), kind, style: style as CSSProperties, glyph });
  for (let i = 0; i < count; i++) {
    switch (kind) {
      case "heart":
        add({
          "--dx": `${(i - (count - 1) / 2) * 18 + rand(-6, 6)}px`,
          "--r": `${rand(-24, 24)}deg`,
          animationDelay: `${i * 130}ms`,
        });
        break;
      case "sparkle": {
        const a = (i / count) * Math.PI * 2 + rand(-0.3, 0.3);
        const d = rand(30, 46);
        add({
          "--dx": `${Math.cos(a) * d}px`,
          "--dy": `${Math.sin(a) * d * 0.8 + 6}px`,
          "--r": `${rand(60, 180)}deg`,
          animationDelay: `${rand(0, 120)}ms`,
        });
        break;
      }
      case "z":
        add({ "--dx": `${16 + i * 6}px`, "--s": 0.8 + i * 0.25, animationDelay: `${i * 420}ms` }, "z");
        break;
      case "note":
        add(
          { "--dx": `${(i % 2 ? -1 : 1) * rand(16, 28)}px`, "--r": `${rand(-20, 20)}deg`, animationDelay: `${i * 260}ms` },
          i % 2 ? "♫" : "♪",
        );
        break;
      case "bang":
        add({ "--dx": "22px" }, "!");
        break;
      case "ask":
        add({ "--dx": "22px" }, "?");
        break;
      case "sweat":
        add({ "--dx": `${i % 2 ? -26 : 28}px`, animationDelay: `${i * 200}ms` });
        break;
      case "star":
        add({ animationDelay: `${(-i / count) * 800}ms`, "--c": CONFETTI[i % 2 ? 0 : 3] });
        break;
      case "confetti": {
        const a = -Math.PI / 2 + rand(-1.3, 1.3);
        const d = rand(46, 84);
        add({
          "--dx": `${Math.cos(a) * d}px`,
          "--dy": `${Math.sin(a) * d}px`,
          "--r": `${rand(-540, 540)}deg`,
          "--c": CONFETTI[i % CONFETTI.length],
          animationDelay: `${rand(0, 90)}ms`,
        });
        break;
      }
    }
  }
  return out;
}

const DEFAULT_COUNT: Record<Emote, number> = {
  heart: 3,
  sparkle: 6,
  z: 1,
  note: 2,
  bang: 1,
  ask: 1,
  sweat: 1,
  star: 3,
  confetti: 16,
};

// ---------------------------------------------------------------------------------------------

export function Body({
  ref,
  walking = false,
  facing = 1,
  sleeping = false,
  still,
  colours,
  children,
}: {
  ref?: Ref<BodyHandle>;
  walking?: boolean;
  facing?: 1 | -1;
  sleeping?: boolean;
  still: boolean;
  colours: { body: string; cap: string; tassel: string };
  children: ReactNode;
}) {
  const actEl = useRef<HTMLSpanElement>(null);
  const shadowEl = useRef<HTMLSpanElement>(null);
  const engine = useRef<ReturnType<typeof createBody> | null>(null);
  const [bits, setBits] = useState<Bit[]>([]);
  const ids = useRef(0);
  const timers = useRef(new Set<number>());

  useEffect(() => {
    if (still || !actEl.current) return;
    const body = createBody(actEl.current, shadowEl.current);
    engine.current = body;
    return () => {
      body.destroy();
      engine.current = null;
    };
  }, [still]);

  useEffect(() => engine.current?.setWalk(walking, facing), [walking, facing, still]);
  useEffect(() => engine.current?.setSleeping(sleeping), [sleeping, still]);

  const emote = useCallback(
    (kind: Emote, count = DEFAULT_COUNT[kind]) => {
      if (still) return;
      const fresh = bitsOf(kind, count, () => ++ids.current);
      setBits((b) => [...b.slice(-40), ...fresh]);
      const t = window.setTimeout(() => {
        timers.current.delete(t);
        const gone = new Set(fresh.map((f) => f.id));
        setBits((b) => b.filter((x) => !gone.has(x.id)));
      }, LIFE_MS[kind] + count * 500);
      timers.current.add(t);
    },
    [still],
  );

  useEffect(() => {
    const all = timers.current;
    return () => all.forEach((t) => clearTimeout(t));
  }, []);

  // Zzz while it sleeps.
  useEffect(() => {
    if (!sleeping || still) return;
    emote("z", 2);
    const t = setInterval(() => emote("z", 2), 1900);
    return () => clearInterval(t);
  }, [sleeping, still, emote]);

  useImperativeHandle(ref, () => ({ act: (a) => engine.current?.act(a), emote }), [emote]);

  return (
    <span
      className={s.life}
      style={
        {
          "--life-body": colours.body,
          "--life-cap": colours.cap,
          "--life-tassel": colours.tassel,
        } as CSSProperties
      }
    >
      <span ref={shadowEl} className={s.shadow} aria-hidden="true" />
      <span ref={actEl} className={s.act}>
        <span className={`${s.breathe} ${sleeping ? s.deep : ""}`}>{children}</span>
      </span>
      <span className={s.fx} aria-hidden="true">
        {bits.map((b) => (
          <span key={b.id} className={`${s.bit} ${s[b.kind]}`} style={b.style}>
            {b.glyph ?? <Glyph kind={b.kind} />}
          </span>
        ))}
      </span>
    </span>
  );
}

function Glyph({ kind }: { kind: Emote }) {
  switch (kind) {
    case "heart":
      return (
        <svg viewBox="0 0 24 24" width="100%" height="100%">
          <path
            fill="currentColor"
            d="M12 21s-7.5-4.6-9.6-9.1C.9 8.6 2.9 4.5 6.7 4.5c2.2 0 3.9 1.3 5.3 3.2 1.4-1.9 3.1-3.2 5.3-3.2 3.8 0 5.8 4.1 4.3 7.4C19.5 16.4 12 21 12 21z"
          />
        </svg>
      );
    case "sparkle":
    case "star":
      return (
        <svg viewBox="0 0 24 24" width="100%" height="100%">
          <path fill="currentColor" d="M12 0c.9 6.4 4.9 10.6 12 12-7.1 1.4-11.1 5.6-12 12-.9-6.4-4.9-10.6-12-12C7.1 10.6 11.1 6.4 12 0z" />
        </svg>
      );
    case "sweat":
      return (
        <svg viewBox="0 0 16 22" width="100%" height="100%">
          <path fill="currentColor" d="M8 0C6 5 0 9.5 0 14a8 8 0 0 0 16 0C16 9.5 10 5 8 0z" />
          <ellipse cx="5" cy="14" rx="1.6" ry="2.6" fill="rgba(255,255,255,.7)" />
        </svg>
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Temperament

type Gaze = readonly [number, number] | null;

const PET_LINES = ["Hehe, that tickles!", "Aww, thank you!", "More pats, please!", "Hehe, hi!"];
const WAKE_LINES = ["Huh?! I’m awake, I’m awake!", "Oh! You’re back!", "Mm… was I asleep?"];

/** The little show for a mood: what the body does and what pops over its head. */
const CHEERS: Record<string, { act?: Act; emote?: Emote; count?: number; gesture?: "nod" | "bounce" | "spin" }> = {
  happy: { act: "hop", emote: "heart", count: 2 },
  excited: { act: "jump", emote: "sparkle" },
  proud: { act: "stretch", emote: "sparkle", count: 5 },
  curious: { act: "perk", emote: "ask" },
  reading: { act: "perk", gesture: "nod" },
  celebrate: { act: "jump", emote: "confetti", gesture: "spin" },
  laughing: { act: "wiggle", emote: "heart", count: 3 },
  surprised: { act: "flinch", emote: "bang" },
  scared: { act: "shiver", emote: "sweat" },
  confused: { act: "sway", emote: "ask" },
  sad: { act: "land", emote: "sweat" },
  approving: { act: "hop", emote: "sparkle", count: 4, gesture: "nod" },
  playful: { act: "wiggle", emote: "note" },
};

export function useLife({
  avatar,
  body,
  target,
  still,
  busy,
  sleepAfterMs,
  startle = true,
  scrollGasp = true,
  sleepy = true,
}: {
  avatar: RefObject<AvatarHandle | null>;
  body: RefObject<BodyHandle | null>;
  /** The element the character is drawn in, to know when the pointer rushes past it. */
  target: RefObject<HTMLElement | null>;
  still: boolean;
  /** Walking, or talking with someone: no fidgets and no dozing meanwhile. */
  busy: boolean;
  sleepAfterMs: number;
  startle?: boolean;
  scrollGasp?: boolean;
  sleepy?: boolean;
}) {
  const [reaction, setReaction] = useState<string | null>(null);
  const [quip, setQuip] = useState<string | null>(null);
  const [asleep, setAsleep] = useState(false);
  const [drowsy, setDrowsy] = useState(false);
  const [gaze, setGaze] = useState<Gaze>(null);

  const busyRef = useRef(busy);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  const asleepRef = useRef(false);
  const reactionRef = useRef<string | null>(null);
  const reactTimer = useRef<number | undefined>(undefined);
  const quipTimer = useRef<number | undefined>(undefined);
  const timers = useRef(new Set<number>());

  const later = useCallback((ms: number, fn: () => void) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  }, []);

  useEffect(() => {
    const all = timers.current;
    return () => {
      all.forEach((t) => clearTimeout(t));
      clearTimeout(reactTimer.current);
      clearTimeout(quipTimer.current);
    };
  }, []);

  const react = useCallback((state: string, ms = 1800) => {
    clearTimeout(reactTimer.current);
    reactionRef.current = state;
    setReaction(state);
    reactTimer.current = window.setTimeout(() => {
      reactionRef.current = null;
      setReaction(null);
    }, ms);
  }, []);

  const say = useCallback((text: string, ms = 2600) => {
    clearTimeout(quipTimer.current);
    setQuip(text);
    quipTimer.current = window.setTimeout(() => setQuip(null), ms);
  }, []);

  /** Act out a mood: a body move, an emote and a gesture of the avatar's. */
  const cheer = useCallback(
    (mood: string) => {
      const c = CHEERS[mood];
      if (!c) return avatar.current?.poke("nod");
      if (c.act) body.current?.act(c.act);
      if (c.emote) body.current?.emote(c.emote, c.count);
      if (c.gesture) avatar.current?.poke(c.gesture);
    },
    [avatar, body],
  );

  // Dozes when nobody is around: drowsy first, then asleep. Wakes with a start.
  useEffect(() => {
    if (!sleepy) return;
    let drowse: number | undefined;
    let doze: number | undefined;
    const arm = () => {
      clearTimeout(drowse);
      clearTimeout(doze);
      drowse = window.setTimeout(() => !busyRef.current && setDrowsy(true), sleepAfterMs * 0.65);
      doze = window.setTimeout(() => {
        if (busyRef.current) return arm();
        asleepRef.current = true;
        setAsleep(true);
        setDrowsy(false);
      }, sleepAfterMs);
    };
    const onActivity = () => {
      setDrowsy(false);
      if (asleepRef.current) {
        asleepRef.current = false;
        setAsleep(false);
        react("surprised", 1300);
        body.current?.act("jump");
        body.current?.emote("bang");
        say(WAKE_LINES[Math.floor(Math.random() * WAKE_LINES.length)]);
      }
      arm();
    };
    arm();
    const events = ["pointermove", "pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () => {
      clearTimeout(drowse);
      clearTimeout(doze);
      events.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [sleepy, sleepAfterMs, react, say, body]);

  // Flinches when the pointer rushes right past it.
  useEffect(() => {
    if (still || !startle) return;
    let lx = 0;
    let ly = 0;
    let lt = 0;
    let quiet = 0;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const now = performance.now();
      const dt = now - lt;
      const speed = dt > 0 && dt < 80 ? Math.hypot(e.clientX - lx, e.clientY - ly) / dt : 0; // px/ms
      lx = e.clientX;
      ly = e.clientY;
      lt = now;
      if (speed < 4 || now < quiet || asleepRef.current || busyRef.current) return;
      const r = target.current?.getBoundingClientRect();
      if (!r) return;
      const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      if (d > 110 || d < r.width / 2) return;
      quiet = now + 7000;
      react("surprised", 900);
      body.current?.act("flinch");
      body.current?.emote("bang");
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [still, startle, target, react, body]);

  // Gasps at a fling of the page.
  useEffect(() => {
    if (still || !scrollGasp) return;
    let ly = window.scrollY;
    let lt = performance.now();
    let quiet = 0;
    const onScroll = () => {
      const now = performance.now();
      const dt = now - lt;
      const speed = dt > 0 ? Math.abs(window.scrollY - ly) / dt : 0;
      ly = window.scrollY;
      lt = now;
      if (speed < 5 || now < quiet || asleepRef.current || dt > 120) return;
      quiet = now + 9000;
      react("scared", 1300);
      body.current?.act("shiver");
      body.current?.emote("sweat", 2);
      say("Wheee! Slow down!", 1800);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [still, scrollGasp, react, say, body]);

  // Fidgets now and then when left alone.
  useEffect(() => {
    if (still) return;
    let t: number;
    const tick = () => {
      t = window.setTimeout(tick, rand(9000, 17000));
      if (busyRef.current || asleepRef.current || reactionRef.current || document.hidden) return;
      const b = body.current;
      const r = Math.random();
      if (r < 0.22) {
        setGaze([-0.85, 0.15]); // a look around
        later(800, () => setGaze([0.85, 0.25]));
        later(1700, () => setGaze(null));
      } else if (r < 0.4) {
        b?.act("hop");
        later(330, () => b?.act("hop"));
        b?.emote("sparkle", 4);
      } else if (r < 0.56) {
        b?.act("sway");
        b?.emote("note", 3);
      } else if (r < 0.7) {
        b?.act("stretch");
      } else if (r < 0.85) {
        b?.act("wiggle");
        avatar.current?.poke("nod");
      } else {
        react("happy", 1600);
        b?.act("perk");
        b?.emote("heart", 1);
      }
    };
    t = window.setTimeout(tick, rand(6000, 9000));
    return () => clearTimeout(t);
  }, [still, avatar, body, react, later]);

  // Petting: stroke it back and forth with the pointer.
  const pet = useRef({ last: 0, x: 0, dir: 0, flips: 0, dist: 0, done: 0 });
  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (e.pointerType === "touch") return;
      const p = pet.current;
      const now = performance.now();
      if (now - p.last > 280) Object.assign(p, { x: e.clientX, dir: 0, flips: 0, dist: 0 });
      const dx = e.clientX - p.x;
      p.x = e.clientX;
      p.last = now;
      if (Math.abs(dx) < 1) return;
      p.dist += Math.abs(dx);
      const dir = Math.sign(dx);
      if (p.dir && dir !== p.dir) p.flips++;
      p.dir = dir;
      if (p.flips < 3 || p.dist < 110 || now - p.done < 2400) return;
      p.done = now;
      Object.assign(p, { flips: 0, dist: 0 });
      react("laughing", 2000);
      body.current?.act("wiggle");
      body.current?.emote("heart", 3);
      say(PET_LINES[Math.floor(Math.random() * PET_LINES.length)]);
    },
    [react, say, body],
  );

  const onPointerEnter = useCallback(() => {
    if (asleepRef.current) return;
    body.current?.act("perk");
    avatar.current?.poke("nod");
  }, [avatar, body]);

  // Taps: each one a jelly squish; five quick ones make it dizzy, then giggly.
  const taps = useRef<number[]>([]);
  const tap = useCallback(() => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 1600), now];
    if (taps.current.length >= 5) {
      taps.current = [];
      react("confused", 1600);
      avatar.current?.poke("spin", 2);
      body.current?.act("dizzy");
      body.current?.emote("star", 4);
      say("Whoa… everything’s spinning!", 2200);
      later(1700, () => {
        react("laughing", 1400);
        body.current?.emote("heart", 2);
      });
      return true;
    }
    body.current?.act("jelly");
    if (taps.current.length >= 3) body.current?.emote("sparkle", 3);
    return false;
  }, [avatar, body, react, say, later]);

  return {
    reaction,
    quip,
    asleep,
    drowsy,
    gaze,
    react,
    say,
    cheer,
    tap,
    pointer: { onPointerMove, onPointerEnter },
  };
}
