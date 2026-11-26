import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

/**
 * "Play a sound" for notifications, on this phone. On by default. The choice is kept on the
 * phone and also sent with its push registration, so the server sends silent pushes (Android's
 * quiet channel) when it is off, even while the app is closed.
 */

const KEY = "cv-sound";
let on = true;
const listeners = new Set<(v: boolean) => void>();

/** Read the saved choice once at start-up. */
export const soundReady = AsyncStorage.getItem(KEY)
  .then((v) => {
    on = v !== "off";
  })
  .catch(() => {});

export function soundOn() {
  return on;
}

export async function setSoundOn(value: boolean) {
  on = value;
  listeners.forEach((l) => l(value));
  await AsyncStorage.setItem(KEY, value ? "on" : "off").catch(() => {});
}

export function useSoundOn(): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(on);
  useEffect(() => {
    soundReady.then(() => setValue(on));
    listeners.add(setValue);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return [value, (v) => void setSoundOn(v)];
}
