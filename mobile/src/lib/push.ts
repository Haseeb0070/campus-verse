import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { apiFetch } from "./api";
import { appRoute } from "./links";
import { soundOn, soundReady } from "./sound";

/**
 * Phone push notifications. After sign-in the app asks once for permission, gets this phone's
 * Expo push token and gives it to the API; the server pushes every notification to it
 * (apps/notifications/push.py). Tapping one opens the right screen.
 *
 * Android delivers them through Firebase Cloud Messaging, so a build needs an EAS project id
 * (expo.extra.eas.projectId) with Firebase credentials. Without them this quietly does nothing:
 * the in-app notifications still work.
 */

// While the app is open, the in-app banner (LiveBanner) already shows new notifications; the
// phone's notification sound still plays, unless "Play a sound" is off in Profile.
Notifications.setNotificationHandler({
  handleNotification: async () => {
    await soundReady;
    return {
      shouldShowBanner: AppState.currentState !== "active",
      shouldShowList: true,
      shouldPlaySound: soundOn(),
      shouldSetBadge: false,
    };
  },
});

let registered: string | null = null;

function projectId(): string | undefined {
  return (
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    Constants.easConfig?.projectId
  );
}

/** Ask (once) and register this phone. Safe to call on every start. */
export async function registerForPush(): Promise<void> {
  if (Platform.OS === "web" || !Device.isDevice) return;
  const id = projectId();
  if (!id) return; // no EAS project in this build: push isn't set up yet
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "CampusVerse",
        importance: AndroidImportance.HIGH,
      });
      // Where the server sends pushes when "Play a sound" is off.
      await Notifications.setNotificationChannelAsync("quiet", {
        name: "CampusVerse (silent)",
        importance: AndroidImportance.HIGH,
        sound: null,
        enableVibrate: false,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== "granted") return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    await soundReady;
    const key = `${token}|${soundOn()}`;
    if (key === registered) return;
    await apiFetch("/api/notifications/devices", {
      method: "POST",
      body: JSON.stringify({ token, platform: Platform.OS, sound: soundOn() }),
    });
    registered = key;
  } catch {
    // No network, no Firebase setup, or permission trouble: try again next start.
  }
}

/** Signing out: this phone stops getting the person's notifications. Call before the token goes. */
export async function unregisterForPush(): Promise<void> {
  if (!registered) return;
  const token = registered.split("|")[0];
  registered = null;
  await apiFetch("/api/notifications/devices/remove", {
    method: "POST",
    body: JSON.stringify({ token }),
  }).catch(() => {});
}

/** Registers once signed in, and opens the screen a tapped notification points to. */
export function usePush(signedIn: boolean) {
  const handled = useRef<string | null>(null);
  const response = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (signedIn) registerForPush();
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn || !response) return;
    const key = response.notification.request.identifier;
    if (handled.current === key) return;
    handled.current = key;
    const link = (response.notification.request.content.data as { link?: string } | undefined)?.link;
    const route = link ? appRoute(link) : null;
    if (route) router.push(route);
  }, [signedIn, response]);
}
