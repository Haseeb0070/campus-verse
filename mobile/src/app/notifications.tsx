import { router } from "expo-router";
import { Alert, FlatList, Pressable, View } from "react-native";
import { Stagger } from "@/components/Stagger";
import { Icon, type IconName } from "@/components/Icon";
import { StackHeader } from "@/components/StackHeader";
import { Button, Divider, Empty, Failed, Press, Skeleton, T } from "@/components/ui";
import { errorDetail } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { appRoute } from "@/lib/links";
import { useMarkRead, useNotifications } from "@/lib/notifications";
import { type RepRequest, useRepAnswer, useRepRequests } from "@/lib/reps";
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
  const anyRep = items.some((n) => (n.kind as string) === "class.rep");
  const repRequests = useRepRequests(anyRep).data ?? [];

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
          renderItem={({ item: n, index }) => {
            const linked = appRoute(n.link) !== null;
            return (
              <Stagger index={index}>
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
                  {(n.kind as string) === "class.rep" ? <RepButtons link={n.link} requests={repRequests} /> : null}
                  {!linked && n.link ? (
                    <T variant="caption" tone="ink3" style={{ fontWeight: "400", marginTop: 2 }}>
                      Open on the CampusVerse website
                    </T>
                  ) : null}
                </View>
                {!n.read ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.accent, marginTop: 8 }} /> : null}
              </Press>
              </Stagger>
            );
          }}
        />
      )}
    </View>
  );
}

/** A CR/GR request's Approve / Decline (or "Did you know?") buttons, right on its notification. */
function RepButtons({ link, requests }: { link: string; requests: RepRequest[] }) {
  const id = Number(/request-(\d+)/.exec(link)?.[1]);
  const r = requests.find((x) => x.id === id);
  const answer = useRepAnswer();
  if (!r || !(r.can_decide || r.can_reply)) return null;
  const go = (kind: "decide" | "reply", yes: boolean) =>
    answer.mutate({ id: r.id, kind, yes }, { onError: (err) => Alert.alert("That didn't work", errorDetail(err, "Try again.")) });
  return (
    <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
      {r.can_decide ? (
        <>
          <Button label="Approve" style={{ flex: 1, minHeight: 40 }} disabled={answer.isPending} onPress={() => go("decide", true)} />
          <Button label="Decline" variant="secondary" style={{ flex: 1, minHeight: 40 }} disabled={answer.isPending} onPress={() => go("decide", false)} />
        </>
      ) : (
        <>
          <Button label="Yes, I knew" style={{ flex: 1, minHeight: 40 }} disabled={answer.isPending} onPress={() => go("reply", true)} />
          <Button label="No, undo it" variant="danger" style={{ flex: 1, minHeight: 40 }} disabled={answer.isPending} onPress={() => go("reply", false)} />
        </>
      )}
    </View>
  );
}
