import { router } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme";
import { IconButton, T } from "./ui";

/** The bar over a pushed screen: back, a title (and its subtitle), and room for actions. */
export function StackHeader({
  title,
  subtitle,
  leading,
  actions,
}: {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  actions?: ReactNode;
}) {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingTop: insets.top + 8,
        paddingBottom: 10,
        paddingHorizontal: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: p.surface,
        borderBottomWidth: StyleSheet.hairlineWidth * 2,
        borderBottomColor: p.line,
      }}
    >
      <IconButton
        icon="back"
        label="Back"
        variant="plain"
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      />
      {leading}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T variant="headline" numberOfLines={1} accessibilityRole="header">
          {title}
        </T>
        {subtitle ? (
          <T variant="caption" tone="ink3" numberOfLines={1} style={{ fontWeight: "400" }}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {actions}
    </View>
  );
}
