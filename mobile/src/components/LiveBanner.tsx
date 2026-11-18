import { router } from "expo-router";
import { View } from "react-native";
import Animated, { FadeOutUp, LinearTransition, SlideInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { appRoute } from "@/lib/links";
import { useLiveNotifications } from "@/lib/notifications";
import { useMe } from "@/lib/queries";
import { font, radius, useTheme } from "@/theme";
import { Icon } from "./Icon";
import { Press, T } from "./ui";

/** A notification that arrives while the app is open drops in from the top, then leaves. */
export function LiveBanner() {
  const me = useMe().data;
  const { toasts, dismiss } = useLiveNotifications(me?.id);
  const p = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", top: insets.top + 6, left: 12, right: 12, gap: 8 }}>
      {toasts.map((t) => (
        <Animated.View
          key={t.id}
          entering={SlideInUp.springify().damping(20)}
          exiting={FadeOutUp.duration(180)}
          layout={LinearTransition.springify()}
        >
          <Press
            accessibilityRole="alert"
            accessibilityLabel={`${t.title}. ${t.body}`}
            accessibilityHint="Opens it"
            scaleTo={0.98}
            onPress={() => {
              dismiss(t.id);
              const route = appRoute(t.link);
              if (route) router.push(route);
            }}
            style={{
              flexDirection: "row",
              gap: 12,
              alignItems: "center",
              padding: 14,
              borderRadius: radius.lg,
              backgroundColor: p.field,
              shadowColor: "#000",
              shadowOpacity: 0.22,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 8 },
              elevation: 8,
            }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: p.accent, alignItems: "center", justifyContent: "center" }}>
              <Icon name="bell" size={18} color={p.onAccent} />
            </View>
            <View style={{ flex: 1 }}>
              <T variant="bodyStrong" tone="onField" numberOfLines={1} style={{ fontFamily: font.bold }}>
                {t.title}
              </T>
              {t.body ? (
                <T variant="callout" tone="onFieldMuted" numberOfLines={2}>
                  {t.body}
                </T>
              ) : null}
            </View>
          </Press>
        </Animated.View>
      ))}
    </View>
  );
}
