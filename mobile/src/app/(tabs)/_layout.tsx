import type { BottomTabBarProps } from "expo-router/tabs";
import { Tabs } from "expo-router";
import * as Haptics from "expo-haptics";
import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "@/components/Icon";
import { useUnreadTotal } from "@/lib/chat";
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

  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        backgroundColor: p.side,
        paddingTop: 6,
        paddingHorizontal: 8,
        paddingBottom: Math.max(insets.bottom, 10),
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
      }}
    >
      {state.routes.map((route, index) => {
        const tab = TABS.find((t) => t.name === route.name);
        if (!tab) return null;
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
            <View
              style={{
                width: 52,
                height: 30,
                borderRadius: 15,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: focused ? p.active : "transparent",
              }}
            >
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
