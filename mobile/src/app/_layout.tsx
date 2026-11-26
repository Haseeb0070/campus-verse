import { Newsreader_500Medium, Newsreader_600SemiBold } from "@expo-google-fonts/newsreader";
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { focusManager, onlineManager, QueryClient } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack, useSegments } from "expo-router";
import { NavigationBar } from "expo-navigation-bar";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Intro } from "@/components/Intro";
import { LiveBanner } from "@/components/LiveBanner";
import { ApiError } from "@/lib/api";
import { AuthProvider, useAuth } from "@/lib/auth";
import { usePush } from "@/lib/push";
import { persister, SAVED_FOR, shouldSave } from "@/lib/offline";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import Constants from "expo-constants";
import { ThemeProvider, useTheme } from "@/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

// Refetch what's on screen when the app comes back to the foreground, like a browser tab does.
focusManager.setEventListener((setFocused) => {
  const sub = AppState.addEventListener("change", (state) => setFocused(state === "active"));
  return () => sub.remove();
});
onlineManager.setOnline(true);

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 20_000,
        // Kept around long enough to be saved for opening offline (lib/offline.ts).
        gcTime: SAVED_FOR,
        // Don't hammer the server over answers that won't change on a retry.
        retry: (count, err) => !(err instanceof ApiError && [401, 403, 404].includes(err.status)) && count < 2,
      },
    },
  });
}

export default function RootLayout() {
  const [client] = useState(makeClient);
  const [fontsLoaded, fontError] = useFonts({
    Newsreader_500Medium,
    Newsreader_600SemiBold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={client}
          persistOptions={{
            persister,
            maxAge: SAVED_FOR,
            // A new app version may read data differently: start fresh rather than misread it.
            buster: Constants.expoConfig?.version ?? "",
            dehydrateOptions: { shouldDehydrateQuery: shouldSave },
          }}
        >
          <AuthProvider>
            <Themed />
          </AuthProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Themed() {
  const { status } = useAuth();
  return (
    <ThemeProvider signedIn={status === "signedIn"}>
      <Navigator />
    </ThemeProvider>
  );
}

function Navigator() {
  const { status } = useAuth();
  const p = useTheme();
  // On a tab, the deep green tab bar sits over the phone's navigation buttons.
  const onTabs = useSegments()[0] === "(tabs)";
  usePush(status === "signedIn");

  useEffect(() => {
    if (status !== "loading") SplashScreen.hideAsync().catch(() => {});
  }, [status]);

  if (status === "loading") return null;
  const signedIn = status === "signedIn";

  return (
    <>
      <StatusBar style={signedIn && p.mode === "light" ? "dark" : "light"} />
      {/* Android's own navigation buttons (on phones that use them, not gestures): light over the
          deep green tab bar and the sign-in screen, and matching the page everywhere else. */}
      <NavigationBar style={!signedIn || onTabs || p.mode === "dark" ? "dark" : "light"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: p.bg },
          animation: Platform.OS === "android" ? "fade_from_bottom" : "default",
        }}
      >
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="chat/[id]" />
          <Stack.Screen name="assignment/[id]" />
          <Stack.Screen name="assignment/edit" />
          <Stack.Screen name="notice/edit" />
          <Stack.Screen name="notice/mine" />
          <Stack.Screen name="subjects/index" />
          <Stack.Screen name="subjects/[id]" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="progress" />
          <Stack.Screen name="resources/index" />
          <Stack.Screen name="resources/[id]" />
          <Stack.Screen name="resources/share" />
          <Stack.Screen name="calendar/index" />
          <Stack.Screen name="calendar/[id]" />
          <Stack.Screen name="calendar/edit" />
          <Stack.Screen name="feed/index" />
          <Stack.Screen name="feed/[id]" />
          <Stack.Screen name="class" />
          <Stack.Screen name="attendance" />
          <Stack.Screen name="requests" />
          <Stack.Screen name="security" />
          <Stack.Screen name="moderation" />
          <Stack.Screen name="manage/index" />
          <Stack.Screen name="manage/people" />
          <Stack.Screen name="manage/requests" />
          <Stack.Screen name="manage/audit" />
          <Stack.Screen name="manage/import" />
          <Stack.Screen name="manage/reports" />
          <Stack.Screen name="manage/theme" />
          <Stack.Screen name="manage/department/people" />
          <Stack.Screen name="manage/department/reports" />
          <Stack.Screen name="manage/academic/index" />
          <Stack.Screen name="manage/academic/cohorts/[id]" />
          <Stack.Screen name="manage/academic/sections/[id]" />
          <Stack.Screen name="search" options={{ animation: "fade" }} />
          <Stack.Screen name="new-chat" options={{ presentation: "modal" }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
      {signedIn && <LiveBanner />}
      {/* Opening the app signed out: Verse bounces out of the splash and into the sign-in tile. */}
      {!signedIn && <Intro />}
    </>
  );
}
