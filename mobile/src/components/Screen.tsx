import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { type ReactNode, useCallback, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNotifications } from "@/lib/notifications";
import { useMe } from "@/lib/queries";
import { initials } from "@/lib/format";
import { font, useTheme } from "@/theme";
import { Avatar, IconButton, Press, T } from "./ui";
import { HeaderVerse } from "./verse/HeaderVerse";

/** Search and notifications, top right of every tab, as in the design. */
export function HeaderActions({ profile = false }: { profile?: boolean }) {
  const unread = useNotifications().data?.unread ?? 0;
  const me = useMe().data;
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      <IconButton icon="search" label="Search" onPress={() => router.push("/search")} />
      <IconButton
        icon="bell"
        label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        dot={unread > 0}
        onPress={() => router.push("/notifications")}
      />
      {profile && me ? (
        <Press accessibilityRole="button" accessibilityLabel="Your profile and settings" onPress={() => router.push("/profile")}>
          <Avatar text={initials(me.preferred_name ? `${me.preferred_name} ${me.last_name}` : me.full_name)} color="lagoon" size={44} />
        </Press>
      ) : null}
    </View>
  );
}

/** A tab's page: the large serif title with its eyebrow, then content that scrolls and refreshes. */
export function Screen({
  eyebrow,
  title,
  actions,
  below,
  children,
  refreshKeys,
  verse,
}: {
  eyebrow?: string;
  title: string;
  actions?: ReactNode;
  /** Sits under the title and scrolls with it (segmented controls, day pickers). */
  below?: ReactNode;
  children: ReactNode;
  /** Query keys a pull-to-refresh reloads. */
  refreshKeys?: readonly (readonly unknown[])[];
  /** Verse stands at the end of the title wearing this mood; false leaves it out. */
  verse?: string | false;
}) {
  const p = useTheme();
  const unread = useNotifications().data?.unread ?? 0;
  const withVerse = p.guide.inApp && verse !== false;
  // Verse stands at the end of the title when the title still fits on one line beside it; if the
  // title has to wrap, Verse moves up to the small line above, so the title keeps its full width.
  const [wrapped, setWrapped] = useState<string | null>(null);
  const inline = withVerse && wrapped !== title;
  const verseEl = withVerse ? <HeaderVerse mood={verse || "calm"} unread={unread} /> : null;
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all((refreshKeys ?? []).map((queryKey) => qc.invalidateQueries({ queryKey })));
    setRefreshing(false);
  }, [qc, refreshKeys]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: p.bg }}
      contentContainerStyle={{ paddingBottom: 28 }}
      refreshControl={
        refreshKeys ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={p.accent} colors={[p.accent]} /> : undefined
      }
    >
      <View
        style={{
          paddingTop: insets.top + 16,
          paddingHorizontal: 20,
          paddingBottom: 16,
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          {eyebrow || (withVerse && !inline) ? (
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, marginBottom: 2 }}>
              {eyebrow ? (
                <T variant="eyebrow" tone="ink3" style={{ flexShrink: 1, marginBottom: inline ? 0 : 6 }}>
                  {eyebrow}
                </T>
              ) : null}
              {inline ? null : verseEl}
            </View>
          ) : null}
          {/* Beside the title, Verse has its own place: the title is never under it. */}
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, minWidth: 0 }}>
            <T
              variant="display"
              accessibilityRole="header"
              style={{ fontFamily: font.display, flexShrink: 1, minWidth: 0 }}
              onLayout={(e) => {
                // More than one line (38px each): give the title the room, move Verse up.
                if (inline && e.nativeEvent.layout.height > 38 * 1.5) setWrapped(title);
              }}
            >
              {title}
            </T>
            {inline ? verseEl : null}
          </View>
        </View>
        {actions}
      </View>
      {below}
      {children}
    </ScrollView>
  );
}
