import { router } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FormError, Sheet } from "@/components/form";
import { StackHeader } from "@/components/StackHeader";
import { Button, Card, Divider, Empty, Failed, IconButton, Pill, Press, Skeleton, T } from "@/components/ui";
import { errorDetail } from "@/lib/api";
import { formatDateTime, relativeTime } from "@/lib/format";
import { type MyNotice, useMyNotices, useNoticeAction } from "@/lib/notices";
import { useTheme } from "@/theme";

/** The notices you wrote: drafts, scheduled, out, expired. Edit, publish, unschedule, archive. */
export default function MyNoticesScreen() {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const mine = useMyNotices();
  const [open, setOpen] = useState<MyNotice | null>(null);
  const list = (mine.data ?? []).filter((n) => n.status !== "archived");

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader
        title="Your notices"
        actions={<IconButton icon="plus" label="New notice" variant="plain" onPress={() => router.push("/notice/edit")} />}
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 32 }}>
        {mine.isPending ? (
          <>
            <Skeleton height={80} />
            <Skeleton height={80} />
          </>
        ) : mine.isError && !mine.data ? (
          <Failed onRetry={() => mine.refetch()} />
        ) : !list.length ? (
          <Empty icon="pin" title="No notices yet" body="Notices you write show here, with who they reach." />
        ) : (
          <Card style={{ gap: 0, paddingVertical: 4 }}>
            {list.map((n, i) => (
              <View key={n.id}>
                {i > 0 && <Divider />}
                <Row n={n} onPress={() => setOpen(n)} />
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
      <Actions n={open} onClose={() => setOpen(null)} />
    </View>
  );
}

function statusOf(n: MyNotice) {
  if (n.status === "scheduled") return { label: "Scheduled", tone: "accent" as const };
  if (n.status === "draft") return { label: "Draft", tone: "warn" as const };
  if (n.expired) return { label: "Expired", tone: "neutral" as const };
  return { label: "Published", tone: "success" as const };
}

function whenOf(n: MyNotice) {
  if (n.status === "scheduled" && n.publish_at) return `goes out ${formatDateTime(n.publish_at)}`;
  if (n.published_at) return relativeTime(n.published_at);
  return `edited ${relativeTime(n.updated_at)}`;
}

function Row({ n, onPress }: { n: MyNotice; onPress: () => void }) {
  const s = statusOf(n);
  const audience = n.targets.map((t) => t.label).join(", ") || "No audience yet";
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={`${n.title}. ${s.label}. ${audience}. ${n.reach} people. ${whenOf(n)}. Options`}
      onPress={onPress}
      scaleTo={0.99}
      style={{ paddingVertical: 12, gap: 6 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pill label={s.label} tone={s.tone} />
        {n.priority === "important" ? <Pill label="Important" tone="accent" /> : null}
      </View>
      <T variant="bodyStrong" numberOfLines={2}>
        {n.title}
      </T>
      <T variant="callout" tone="ink3" numberOfLines={2}>
        {audience} · {n.reach} {n.reach === 1 ? "person" : "people"} · {whenOf(n)}
      </T>
    </Press>
  );
}

function Actions({ n, onClose }: { n: MyNotice | null; onClose: () => void }) {
  const action = useNoticeAction();
  const [error, setError] = useState<string | null>(null);

  function run(kind: "publish" | "unschedule" | "archive") {
    if (!n) return;
    setError(null);
    action.mutate(
      { id: n.id, action: kind },
      { onSuccess: onClose, onError: (err) => setError(errorDetail(err, "That didn't work. Try again.")) },
    );
  }

  function archive() {
    Alert.alert("Archive this notice?", "It comes off everyone's board. This can't be undone here.", [
      { text: "Cancel", style: "cancel" },
      { text: "Archive", style: "destructive", onPress: () => run("archive") },
    ]);
  }

  const close = () => {
    setError(null);
    onClose();
  };

  return (
    <Sheet visible={!!n} onClose={close} title={n?.title ?? ""}>
      {n ? (
        <View style={{ gap: 10 }}>
          {n.expires_at && !n.expired ? (
            <T variant="callout" tone="ink3">
              Comes down {formatDateTime(n.expires_at)}
            </T>
          ) : null}
          <Button
            label="Edit"
            icon="pencil"
            variant="secondary"
            onPress={() => {
              close();
              router.push({ pathname: "/notice/edit", params: { id: String(n.id) } });
            }}
          />
          {(n.status === "draft" || n.status === "scheduled") && n.targets.length > 0 ? (
            <Button
              label={n.status === "scheduled" ? "Publish now" : "Publish"}
              busy={action.isPending && action.variables?.action === "publish"}
              onPress={() => run("publish")}
            />
          ) : null}
          {n.status === "scheduled" ? (
            <Button
              label="Cancel the schedule"
              variant="secondary"
              busy={action.isPending && action.variables?.action === "unschedule"}
              onPress={() => run("unschedule")}
            />
          ) : null}
          <Button label="Archive" icon="trash" variant="danger" onPress={archive} />
          <FormError text={error} />
        </View>
      ) : null}
    </Sheet>
  );
}
