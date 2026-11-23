import { router } from "expo-router";
import { FlatList, Pressable, View } from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import { StackHeader } from "@/components/StackHeader";
import { Divider, Empty, Failed, Press, Skeleton, T } from "@/components/ui";
import { relativeTime } from "@/lib/format";
import { appRoute } from "@/lib/links";
import { useMarkRead, useNotifications } from "@/lib/notifications";
import type { AppNotification, NotificationKind } from "@/lib/types";
import { useTheme } from "@/theme";

const ICON: Record<NotificationKind, IconName> = {
  "notice.published": "pin",
  "class.changed": "swap",
  "assignment.opened": "clipboard",
  "assignment.due_soon": "clock",
  "grades.released": "chart",
  "feed.comment": "chat",
  "moderation.action": "pin",
  "resource.shared": "file",
  "account.correction": "user",
  "event.update": "calendar",
};

export default function Notifications() {
  const p = useTheme();
  const query = useNotifications();
  const markRead = useMarkRead();
  const items = query.data?.items ?? [];
  const unread = query.data?.unread ?? 0;

  function open(n: AppNotification) {
    if (!n.read) markRead([n.id]).catch(() => {});
    const route = appRoute(n.link);
    if (route) router.push(route);
  }

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader
        title="Notifications"
        subtitle={unread ? `${unread} unread` : "All caught up"}
        actions={
          unread ? (
            <Pressable accessibilityRole="button" onPress={() => markRead()} hitSlop={10} style={{ paddingHorizontal: 12, minHeight: 44, justifyContent: "center" }}>
              <T variant="calloutStrong" tone="accentInk">
                Mark all read
              </T>
            </Pressable>
          ) : null
        }
      />
      {query.isPending ? (
        <View style={{ padding: 16 }}>
          <Skeleton height={300} />
        </View>
      ) : query.isError && !query.data ? (
        <Failed onRetry={() => query.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => String(n.id)}
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <Divider inset={72} />}
          onRefresh={() => query.refetch()}
          refreshing={query.isRefetching}
          ListEmptyComponent={<Empty icon="bell" title="Nothing yet" body="Room changes, new notices, coursework and marks show up here." />}
          renderItem={({ item: n }) => {
            const linked = appRoute(n.link) !== null;
            return (
              <Press
                scaleTo={0.99}
                accessibilityRole={linked ? "button" : undefined}
                accessibilityLabel={`${n.read ? "" : "Unread. "}${n.title}. ${n.body}. ${relativeTime(n.created_at)}`}
                onPress={() => open(n)}
                style={{ flexDirection: "row", gap: 14, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: n.read ? "transparent" : p.surface }}
              >
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: n.read ? p.fill : p.accentSoft, alignItems: "center", justifyContent: "center" }}>
                  <Icon name={ICON[n.kind] ?? "bell"} size={19} color={n.read ? p.ink3 : p.accentInk} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    <T variant={n.read ? "body" : "bodyStrong"} style={{ flex: 1 }}>
                      {n.title}
                    </T>
                    <T variant="caption" tone="ink3" style={{ fontWeight: "400" }}>
                      {relativeTime(n.created_at)}
                    </T>
                  </View>
                  {n.body ? (
                    <T variant="callout" tone="ink2" numberOfLines={3}>
                      {n.body}
                    </T>
                  ) : null}
                  {!linked && n.link ? (
                    <T variant="caption" tone="ink3" style={{ fontWeight: "400", marginTop: 2 }}>
                      Open on the CampusVerse website
                    </T>
                  ) : null}
                </View>
                {!n.read ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.accent, marginTop: 8 }} /> : null}
              </Press>
            );
          }}
        />
      )}
    </View>
  );
}
