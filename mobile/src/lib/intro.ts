import { useSyncExternalStore } from "react";

/** Where the sign-in screen's logo tile sits on screen, in window coordinates. */
export type Spot = { x: number; y: number; width: number; height: number };

let running = false;
let spot: Spot | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** The opening animation, shared between the intro (which plays it) and the sign-in screen (which
 *  hides its logo tile while Verse is on its way there). It plays once per launch. */
export const intro = {
  played: false,
  start() {
    running = true;
    emit();
  },
  finish() {
    running = false;
    intro.played = true;
    emit();
  },
  setSpot(next: Spot) {
    spot = next;
  },
  spot: () => spot,
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useIntroRunning() {
  return useSyncExternalStore(subscribe, () => running, () => running);
}
