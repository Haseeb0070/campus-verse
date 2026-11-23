import type { BottomTabBarProps } from "expo-router/tabs";
import { Tabs } from "expo-router";
import * as Haptics from "expo-haptics";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "@/components/Icon";
import { useUnreadTotal } from "@/lib/chat";
import { useMe } from "@/lib/queries";
import { font, useTheme } from "@/theme";

const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: "index", label: "Today", icon: "home" },
  { name: "timetable", label: "Timetable", icon: "calendar" },
  { name: "chat", label: "Chat", icon: "chat" },
  { name: "notices", label: "Notices", icon: "pin" },
  { name: "work", label: "Work", icon: "clipboard" },
];

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, animation: "fade" }} tabBar={(props) => <TabBar {...props} />}>
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{ title: t.label }} />
      ))}
    </Tabs>
  );
}

/** The design's deep green bar: rounded on top, the current tab's icon on an accent pill. */
function TabBar({ state, navigateToTab }: BottomTabBarProps) {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const unread = useUnreadTotal();
  // Timetable and Work are about one's own classes: staff with none (an admin who doesn't teach)
  // don't get tabs that could only ever be empty.
  const me = useMe().data;
  const hasClasses = !me || me.kind !== "staff" || me.sections.length > 0;

  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        backgroundColor: p.side,
        paddingTop: 6,
        paddingHorizontal: 8,
        // Above the phone's own navigation: the gesture handle, or the three buttons, whichever it has.
        paddingBottom: Math.max(insets.bottom, 10),
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
      }}
    >
      {state.routes.map((route, index) => {
        const tab = TABS.find((t) => t.name === route.name);
        if (!tab || (!hasClasses && (tab.name === "timetable" || tab.name === "work"))) return null;
        const focused = state.index === index;
        const badge = tab.name === "chat" && unread > 0 ? unread : 0;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={badge ? `${tab.label}, ${badge} unread` : tab.label}
            onPress={() => {
              if (focused) return;
              if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
              navigateToTab(route.key);
            }}
            style={{ flex: 1, alignItems: "center", gap: 4, paddingTop: 8, paddingBottom: 4, minHeight: 52 }}
          >
            <View style={{ width: 56, height: 32, alignItems: "center", justifyContent: "center" }}>
              {/* The pill is its own view, mounted on the tab that's chosen: Android drops the rounded
                  corners of a view whose background changes after it first draws, which left a square. */}
              {focused ? (
                <Animated.View
                  key={p.active}
                  entering={ZoomIn.springify().damping(18).stiffness(260)}
                  style={[StyleSheet.absoluteFill, { borderRadius: 16, borderCurve: "continuous", backgroundColor: p.active }]}
                />
              ) : null}
              <Icon name={tab.icon} color={focused ? p.onActive : p.onSideMuted} />
              {badge ? (
                <View
                  style={{
                    position: "absolute",
                    top: -4,
                    right: 4,
                    minWidth: 18,
                    height: 18,
                    borderRadius: 9,
                    paddingHorizontal: 5,
                    backgroundColor: focused ? p.onActive : p.accent,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 2,
                    borderColor: p.side,
                  }}
                >
                  <Text style={{ fontFamily: font.bold, fontSize: 10, color: focused ? p.active : p.onAccent }}>
                    {badge > 99 ? "99+" : badge}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text
              style={{
                fontFamily: focused ? font.bold : font.medium,
                fontSize: 11,
                color: focused ? p.onSide : p.onSideMuted,
              }}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
