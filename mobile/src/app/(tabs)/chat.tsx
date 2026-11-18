import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { ConversationRow } from "@/components/conversations";
import { HeaderActions, Screen } from "@/components/Screen";
import { Button, Card, Divider, Empty, Failed, Segmented, Skeleton, T } from "@/components/ui";
import { conversationsKey, useConversations } from "@/lib/chat";
import { useMe } from "@/lib/queries";

type Tab = "sections" | "direct" | "requests";

export default function Chats() {
  const me = useMe().data;
  const tz = me?.institution?.timezone;
  const query = useConversations();
  const [tab, setTab] = useState<Tab>("sections");

  const all = query.data ?? [];
  const requests = all.filter((c) => c.kind === "direct" && c.request_status === "pending" && !c.requested_by_me);
  const lists: Record<Tab, typeof all> = {
    sections: all.filter((c) => c.kind !== "direct"),
    direct: all.filter((c) => c.kind === "direct" && !requests.includes(c) && c.request_status !== "declined"),
    requests,
  };
  const unread = (t: Tab) => lists[t].reduce((n, c) => n + (c.muted ? 0 : c.unread), 0);
  const list = lists[tab];

  return (
    <Screen
      title="Chat"
      actions={<HeaderActions />}
      refreshKeys={[conversationsKey]}
      below={
        <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { key: "sections", label: "Sections", count: unread("sections") },
              { key: "direct", label: "Direct", count: unread("direct") },
              { key: "requests", label: "Requests", count: requests.length },
            ]}
          />
        </View>
      }
    >
      <View style={{ paddingHorizontal: 16, gap: 16 }}>
        {query.isPending ? (
          <Skeleton height={290} />
        ) : query.isError ? (
          <Failed onRetry={() => query.refetch()} />
        ) : list.length === 0 ? (
          <Empty
            icon="chat"
            title={{ sections: "No section chats yet", direct: "No direct messages", requests: "No requests" }[tab]}
            body={
              {
                sections: "When you're enrolled in a section, its chat appears here.",
                direct: "Start a one-to-one chat with a classmate or teacher.",
                requests: "When someone you don't share a chat with messages you, it waits here.",
              }[tab]
            }
            action={
              tab === "direct" ? (
                <Button label="New message" icon="plus" onPress={() => router.push("/new-chat")} style={{ marginTop: 6 }} />
              ) : undefined
            }
          />
        ) : (
          <Card padded={false}>
            {list.map((c, i) => (
              <View key={c.id}>
                {i > 0 && <Divider inset={74} />}
                <ConversationRow c={c} tz={tz} />
              </View>
            ))}
          </Card>
        )}

        {tab === "sections" && list.length > 0 ? (
          <T variant="callout" tone="ink3" style={{ paddingHorizontal: 4 }}>
            Every section you’re in has its own chat, with your teacher in it.
          </T>
        ) : null}
        {tab === "direct" && list.length > 0 ? (
          <Button label="New message" icon="plus" variant="secondary" onPress={() => router.push("/new-chat")} />
        ) : null}
      </View>
    </Screen>
  );
}
