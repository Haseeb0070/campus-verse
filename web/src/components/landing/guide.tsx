"use client";

import { type AvatarHandle, createAvatar } from "@bible-strong/avatar-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CloseIcon } from "@/components/icons";
import { useTheme } from "@/components/theme-provider";
import { guideColours } from "@/lib/theme";
import character from "./guide.avatar.json";
import s from "./guide.module.css";

/*
 * Verse, the landing page's guide: CampusVerse's own character (a terracotta ball in a graduation
 * cap), drawn by the MIT-licensed @bible-strong/avatar-react.
 *
 * Verse lives on the page on its own terms. It stands in an empty spot, strolls to another now and
 * then, and when someone presses a button or a link it walks over beside it and looks at it. It
 * never covers anything: it only ever stands where there is no text, link, button, picture or card
 * (see SOLID), its tip opens only where there is room, and with no empty spot near it steps out of
 * sight until there is one. It also says one line about the section in view.
 */

/** The guide drawn in the colours the admin chose (or the theme's), under the name they chose. */
export function makeGuide(name: string, colours: { body: string; cap: string; tassel: string }) {
  const [base, board, tassel] = character.body.nodes;
  return createAvatar({
    ...character,
    name,
    colors: { ...character.colors, body: colours.body },
    body: {
      ...character.body,
      nodes: [
        { ...base, color: colours.cap },
        { ...board, color: colours.cap },
        { ...tassel, color: colours.tassel },
      ],
    },
  });
}

type Stop = { id: string | null; state: string; line: string };

/** Each section of the page, top to bottom, with what Verse does and says there. */
const STOPS: Stop[] = [
  { id: null, state: "happy", line: "Salaam! I’m {name}. Scroll and I’ll show you around CampusVerse." },
  { id: "week", state: "reading", line: "This is BS CS G1+G2’s week. Tap a day to see its classes and rooms." },
  { id: "menu", state: "proud", line: "Students, teachers and the college office each get their own tools." },
  { id: "questions", state: "curious", line: "New here? Start with “How do I sign in?”." },
  { id: "signin", state: "excited", line: "Ready? Use your roll number @gcslahore.edu.pk." },
  { id: "end", state: "celebrate", line: "See you in R-127!" },
];

/** What Verse must never cover: the page's cards (marked data-solid) and anything with content. */
const SOLID =
  "[data-solid], h1, h2, h3, h4, p, li, a, button, img, figure, figcaption, summary, dt, dd, label, input, textarea, select, table";

/** What Verse comes over to look at when it is pressed. */
const PRESSABLE = "a, button, summary, [role='button'], input, select, textarea";

type Box = { x: number; y: number; w: number; h: number };
type Rect = { left: number; top: number; right: number; bottom: number };

/** Every solid thing on screen right now, leaving out Verse itself. */
function solidRects(self: Element | null): Rect[] {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const out: Rect[] = [];
  for (const el of document.querySelectorAll(SOLID)) {
    if (self?.contains(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
    out.push(r);
  }
  return out;
}

const PAD = 8; // clear space kept around solid things and the screen's edges

function isFree(b: Box, rects: Rect[]) {
  if (b.x < PAD || b.y < PAD || b.x + b.w > window.innerWidth - PAD || b.y + b.h > window.innerHeight - PAD) {
    return false;
  }
  return !rects.some(
    (r) =>
      b.x < r.right + PAD && b.x + b.w > r.left - PAD && b.y < r.bottom + PAD && b.y + b.h > r.top - PAD,
  );
}

const RINGS = [0, 40, 70, 110, 160, 220, 290, 370, 460, 560, 680];
const TURNS = 24;

/** The free box of size w × h nearest to (px, py); null when none is near. */
function nearestFree(px: number, py: number, w: number, h: number, rects: Rect[]): Box | null {
  let best: Box | null = null;
  let bestD = Infinity;
  for (const r of RINGS) {
    for (let i = 0; i < (r === 0 ? 1 : TURNS); i++) {
      const a = (i * 2 * Math.PI) / TURNS;
      const cx = px + Math.cos(a) * r;
      const cy = py + Math.sin(a) * r;
      const b = { x: cx - w / 2, y: cy - h / 2, w, h };
      if (!isFree(b, rects)) continue;
      const d = Math.hypot(cx - px, cy - py);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    if (best) return best; // rings grow outward: the first ring with a spot holds the nearest
  }
  return null;
}

const BUBBLE_W = 270;
const BUBBLE_H = 100; // three lines of the tip, with room to spare

/** Which side of Verse its tip fits on without covering anything, or null. */
function bubbleSide(spot: Box, rects: Rect[]): "left" | "right" | null {
  const y = spot.y + 4;
  const left = { x: spot.x - 10 - BUBBLE_W, y, w: BUBBLE_W, h: BUBBLE_H };
  const right = { x: spot.x + spot.w + 10, y, w: BUBBLE_W, h: BUBBLE_H };
  const preferLeft = spot.x + spot.w / 2 > window.innerWidth / 2;
  const order: ["left" | "right", Box][] = preferLeft
    ? [["left", left], ["right", right]]
    : [["right", right], ["left", left]];
  for (const [side, b] of order) if (isFree(b, rects)) return side;
  return null;
}

/** The last section whose top has passed the upper part of the screen (the top of the page when none). */
function useStop() {
  const [stop, setStop] = useState(0);
  useEffect(() => {
    const update = () => {
      const line = window.innerHeight * 0.4;
      let found = 0;
      STOPS.forEach(({ id }, i) => {
        const el = id ? document.getElementById(id) : null;
        if (el && el.getBoundingClientRect().top <= line) found = i;
      });
      const atBottom =
        window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
      if (atBottom && window.scrollY > 0) found = STOPS.length - 1;
      setStop(found);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return stop;
}

/** Whether Verse may walk (motion allowed), and whether the screen is a phone's. */
function useMode() {
  const [mode, setMode] = useState({ glide: true, phone: false });
  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    const phone = window.matchMedia("(max-width: 720px)");
    const update = () => setMode({ glide: !still.matches, phone: phone.matches });
    update();
    still.addEventListener("change", update);
    phone.addEventListener("change", update);
    return () => {
      still.removeEventListener("change", update);
      phone.removeEventListener("change", update);
    };
  }, []);
  return mode;
}

type Look = [number, number] | null;

/**
 * Where Verse stands and how it gets there. It keeps its spot while the spot stays empty, strolls
 * to another now and then, and walks over to whatever is pressed. Positions are written straight
 * on the element's style; React hears only about travel, facing, the gaze, the tip's side and
 * whether Verse is in sight.
 */
function useWalk(ref: React.RefObject<HTMLElement | null>, { glide, box }: { glide: boolean; box: number }) {
  const [moving, setMoving] = useState(false);
  const [facing, setFacing] = useState<1 | -1>(-1);
  const [look, setLook] = useState<Look>(null);
  const [side, setSide] = useState<"left" | "right" | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let x = NaN;
    let y = NaN;
    let tx = 0;
    let ty = 0;
    let frame = 0;
    let settle: ReturnType<typeof setTimeout> | undefined;
    let unlook: ReturnType<typeof setTimeout> | undefined;
    let wanderTimer: ReturnType<typeof setTimeout> | undefined;
    let lookAtPoint: { x: number; y: number } | null = null;
    let lastPress = 0;
    // Mirrors of the React state, so it is only set when it changes.
    let isShown = false;
    let tipSide: "left" | "right" | null = null;
    let isMoving = false;
    let faces: 1 | -1 = -1;

    const place = () => {
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    };
    const show = (v: boolean) => v !== isShown && setShown((isShown = v));
    const tip = (v: "left" | "right" | null) => v !== tipSide && setSide((tipSide = v));
    const travel = (v: boolean) => v !== isMoving && setMoving((isMoving = v));
    const here = (): Box => ({ x, y, w: box, h: box });

    // Arrived: check the spot is still empty, open the tip if it fits, and look at what was pressed.
    const arrive = () => {
      const rects = solidRects(el);
      if (!isFree(here(), rects)) return stayClear();
      travel(false);
      tip(bubbleSide(here(), rects));
      if (lookAtPoint) {
        const dx = lookAtPoint.x - (x + box / 2);
        const dy = lookAtPoint.y - (y + box / 2);
        const len = Math.hypot(dx, dy) || 1;
        setLook([(dx / len) * 0.9, (-dy / len) * 0.9]);
        lookAtPoint = null;
        clearTimeout(unlook);
        unlook = setTimeout(() => setLook(null), 3500);
      }
    };

    const step = () => {
      const dx = tx - x;
      const dy = ty - y;
      if (Math.hypot(dx, dy) < 0.6) {
        x = tx;
        y = ty;
        place();
        frame = 0;
        clearTimeout(settle);
        settle = setTimeout(arrive, 120);
        return;
      }
      // An easy walking pace: a fifth of the way each frame, at most 14 px.
      const k = Math.min(0.2, 14 / Math.hypot(dx, dy));
      x += dx * k;
      y += dy * k;
      place();
      frame = requestAnimationFrame(step);
    };

    /** Walk to the empty spot nearest (px, py); out of sight when there is none. */
    const goNear = (px: number, py: number) => {
      const spot = nearestFree(px, py, box, box, solidRects(el));
      if (!spot) {
        show(false); // nowhere empty nearby: out of the way rather than over anything
        tip(null);
        return false;
      }
      show(true);
      if (Number.isNaN(x) || !glide) {
        x = tx = spot.x;
        y = ty = spot.y;
        place();
        clearTimeout(settle);
        settle = setTimeout(arrive, 120);
        return true;
      }
      if (Math.abs(spot.x - tx) < 1 && Math.abs(spot.y - ty) < 1 && !frame) {
        clearTimeout(settle);
        settle = setTimeout(arrive, 120);
        return true;
      }
      tx = spot.x;
      ty = spot.y;
      tip(null); // the tip waits until Verse arrives
      const dx = tx - x;
      if (Math.abs(dx) > 6) {
        const f: 1 | -1 = dx > 0 ? 1 : -1;
        if (f !== faces) setFacing((faces = f));
      }
      if (Math.hypot(tx - x, ty - y) > 30) travel(true);
      if (!frame) frame = requestAnimationFrame(step);
      return true;
    };

    /** The page moved under Verse: keep the spot if it is still empty, else find the nearest. */
    const stayClear = () => {
      if (Number.isNaN(x)) return goNear(window.innerWidth - box, window.innerHeight - box);
      const rects = solidRects(el);
      if (!frame && isFree(here(), rects)) {
        show(true);
        tip(bubbleSide(here(), rects));
        return true;
      }
      return goNear(x + box / 2, y + box / 2);
    };

    // A stroll now and then, when nobody has pressed anything for a while.
    const wander = () => {
      wanderTimer = setTimeout(wander, 7000 + Math.random() * 6000);
      if (!glide || frame || Date.now() - lastPress < 6000 || document.hidden) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const px = w * (0.1 + Math.random() * 0.8);
      const py = 90 + Math.random() * Math.max(0, h - 180);
      const spot = nearestFree(px, py, box, box, solidRects(el));
      // Only a real stroll: somewhere else on screen, not a shuffle on the spot.
      if (spot && Math.hypot(spot.x - x, spot.y - y) > 80) goNear(px, py);
    };

    // Something pressed: walk over beside it and look at it.
    const onPress = (target: EventTarget | null) => {
      const t = (target as Element | null)?.closest?.(PRESSABLE);
      if (!t || el.contains(t)) return;
      const r = t.getBoundingClientRect();
      lastPress = Date.now();
      lookAtPoint = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      setLook(null);
      if (!goNear(lookAtPoint.x, lookAtPoint.y)) lookAtPoint = null;
    };
    const onPointerDown = (e: PointerEvent) => onPress(e.target);
    const onFocus = (e: FocusEvent) => {
      // Keyboard only: a click already moved Verse on pointerdown.
      if ((e.target as Element | null)?.matches?.(":focus-visible")) onPress(e.target);
    };

    // Scrolling moves the page under Verse: look again, at most every 80 ms.
    let pending = false;
    const onScroll = () => {
      if (pending) return;
      pending = true;
      setTimeout(() => {
        pending = false;
        stayClear();
      }, 80);
    };

    stayClear();
    wanderTimer = setTimeout(wander, 6000);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocus, true);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocus, true);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
      clearTimeout(settle);
      clearTimeout(unlook);
      clearTimeout(wanderTimer);
    };
  }, [ref, glide, box]);

  return { moving, facing, look, side, shown };
}

export default function Guide({ on }: { on: boolean }) {
  const { site } = useTheme();
  // Off when the visitor put it away, or when the admins turned the guide off for the site.
  if (!on || !site.guide_enabled) return null;
  return <Companion />;
}

function Companion() {
  const { site } = useTheme();
  const name = site.guide_name || "Verse";
  const colours = guideColours(site);
  const Verse = useMemo(
    () => makeGuide(name, colours),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuilt only when a colour or the name changes
    [name, colours.body, colours.cap, colours.tassel],
  );
  const stop = useStop();
  const { glide, phone } = useMode();
  const size = phone ? 60 : 72;
  const box = size + 16; // with the disc around it
  const el = useRef<HTMLElement>(null);
  const avatar = useRef<AvatarHandle>(null);
  const { moving, facing, look, side, shown } = useWalk(el, { glide, box });
  // A tap on Verse puts the tip away and brings it back.
  const [talking, setTalking] = useState(true);
  const { state } = STOPS[stop];
  const line = STOPS[stop].line.replace("{name}", name);

  // A small nod each time Verse has something new to say.
  useEffect(() => {
    if (stop > 0) avatar.current?.poke("nod");
  }, [stop]);

  return (
    <aside ref={el} className={`${s.guide} ${shown ? s.shown : ""}`} aria-label={`${name}, your guide`}>
      <button
        type="button"
        className={`${s.disc} ${s.discButton}`}
        onClick={() => {
          setTalking((t) => !t);
          avatar.current?.poke("bounce");
        }}
        aria-label={talking ? `${name}: hide tips` : `${name}: show tips`}
        aria-expanded={talking}
      >
        <Verse
          ref={avatar}
          // Walking, it runs; looking at something pressed, it is curious; otherwise the section's mood.
          state={moving ? "running" : look ? "curious" : state}
          lookAt={moving ? [facing * 0.9, 0] : look}
          size={size}
          ariaLabel={`${name}, the CampusVerse guide`}
        />
      </button>
      {side && !moving && talking && (
        <div className={`${s.bubble} ${side === "left" ? s.toLeft : s.toRight}`}>
          <p key={stop} className={s.line} aria-live="polite">
            {line}
          </p>
          <button
            type="button"
            className={s.close}
            onClick={() => setTalking(false)}
            aria-label={`Hide ${name}’s tips`}
          >
            <CloseIcon className="size-4" />
          </button>
        </div>
      )}
    </aside>
  );
}
