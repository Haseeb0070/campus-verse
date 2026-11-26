import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, { FadeInDown, FadeOutDown, LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { onError } from "@/lib/errors";
import { font, radius, useTheme } from "@/theme";
import { Icon } from "./Icon";
import { Press, T } from "./ui";

type Shown = { id: number; message: string };
let next = 0;

/** The error pop-up: a card near the bottom whenever something goes wrong that the screen can't
 *  explain itself. It stays 7 seconds, or until tapped. */
export function ErrorPopup() {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Shown[]>([]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const off = onError((message) => {
      const id = ++next;
      setItems((list) => [...list.filter((i) => i.message !== message), { id, message }].slice(-2));
      timers.push(setTimeout(() => setItems((list) => list.filter((i) => i.id !== id)), 7000));
    });
    return () => {
      off();
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 12, right: 12, bottom: insets.bottom + 84, gap: 8 }}>
      {items.map((i) => (
        <Animated.View key={i.id} entering={FadeInDown.springify().damping(18)} exiting={FadeOutDown.duration(160)}
          layout={LinearTransition.springify()}>
          <Press accessibilityRole="alert" accessibilityLabel={i.message} accessibilityHint="Closes it" scaleTo={0.98}
            onPress={() => setItems((list) => list.filter((x) => x.id !== i.id))}
            style={{
              flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: radius.lg,
              backgroundColor: p.surface, borderWidth: 1, borderColor: p.danger,
              shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6,
            }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: p.danger, alignItems: "center", justifyContent: "center" }}>
              <T style={{ color: "#fff", fontFamily: font.bold, fontSize: 14 }}>!</T>
            </View>
            <T variant="calloutStrong" style={{ flex: 1, color: p.ink }}>{i.message}</T>
            <Icon name="close" size={16} color={p.ink2} />
          </Press>
        </Animated.View>
      ))}
    </View>
  );
}
