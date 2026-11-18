import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "campusverse.session";

/**
 * The allauth app session token. Kept in the device keychain (Keystore on Android); on web,
 * where there is no keychain, in localStorage for the development preview only.
 */
let token: string | null = null;

export const tokenStore = {
  current: () => token,

  async load(): Promise<string | null> {
    try {
      token =
        Platform.OS === "web"
          ? globalThis.localStorage?.getItem(KEY) ?? null
          : await SecureStore.getItemAsync(KEY);
    } catch {
      token = null;
    }
    return token;
  },

  async save(value: string | null) {
    token = value;
    try {
      if (Platform.OS === "web") {
        if (value) globalThis.localStorage?.setItem(KEY, value);
        else globalThis.localStorage?.removeItem(KEY);
      } else if (value) {
        await SecureStore.setItemAsync(KEY, value);
      } else {
        await SecureStore.deleteItemAsync(KEY);
      }
    } catch {
      // Keeping it in memory still signs this run in; the next launch asks again.
    }
  },
};
