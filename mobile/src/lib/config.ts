import Constants from "expo-constants";
import { Platform } from "react-native";

/** Django's port in development (8000 is taken by another project on this machine). */
const DEV_PORT = 8010;

/**
 * Where the API lives. Set EXPO_PUBLIC_API_URL for a real server (e.g. https://api.college.edu).
 * In development without it, the app finds the computer running Expo: the same host the
 * JavaScript bundle came from, so a phone on the same Wi-Fi reaches Django without setup.
 */
function resolveApiUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/+$/, "");

  if (Platform.OS === "web") return `http://localhost:${DEV_PORT}`;
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  if (host) return `http://${host}:${DEV_PORT}`;
  // Android's emulator sees the computer as 10.0.2.2; iOS's simulator shares its localhost.
  return Platform.OS === "android" ? `http://10.0.2.2:${DEV_PORT}` : `http://localhost:${DEV_PORT}`;
}

export const API_URL = resolveApiUrl();

/** A server-sent URL that points at "localhost" means the API's own machine, which a phone
 *  can only reach by the API's host name. */
export function reachable(url: string): string {
  try {
    const target = new URL(url);
    if (target.hostname === "localhost" || target.hostname === "127.0.0.1") {
      target.hostname = new URL(API_URL).hostname;
    }
    return target.toString();
  } catch {
    return url;
  }
}
