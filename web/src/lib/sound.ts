/*
 * The notification chime: two soft notes made by the browser's own audio (no sound file to
 * download). On by default; each person can turn it off for this device in Profile.
 *
 * Browsers only allow sound after someone has interacted with the page, so the audio is woken
 * on the first click or key press and a chime before that is skipped silently.
 */

const KEY = "cv-sound";

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!context) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
  }
  return context;
}

/** Wakes the audio on the first interaction, so later chimes are allowed to play. */
export function unlockSoundOnFirstTouch() {
  if (typeof window === "undefined") return;
  const wake = () => {
    audio()?.resume().catch(() => {});
    window.removeEventListener("pointerdown", wake);
    window.removeEventListener("keydown", wake);
  };
  window.addEventListener("pointerdown", wake, { once: true });
  window.addEventListener("keydown", wake, { once: true });
}

export function soundOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Storage blocked: the choice lasts for this visit only.
  }
}

/** A short, gentle two-note chime; louder for something marked important. */
export function playChime(important = false) {
  if (!soundOn()) return;
  const ctx = audio();
  if (!ctx || ctx.state !== "running") return;
  const now = ctx.currentTime;
  const notes = important ? [880, 1174.66] : [659.25, 987.77]; // A5→D6, or E5→B5
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const start = now + i * 0.12;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(important ? 0.16 : 0.1, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.5);
  });
}
