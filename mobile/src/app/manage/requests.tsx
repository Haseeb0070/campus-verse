import { useState } from "react";
import { KeyboardAvoidingView, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FormError } from "@/components/form";
import { ManageNotAllowed } from "@/components/manage-bits";
import { StackHeader } from "@/components/StackHeader";
import { Avatar, Button, Card, Empty, Failed, Field, Skeleton, T } from "@/components/ui";
import { errorDetail } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { type ManagedCorrection, useCorrectionQueue, useManageAccess, useResolveCorrection } from "@/lib/manage";
import { useTheme } from "@/theme";

/** People asking to fix their records: mark each fixed, or decline it with a reason. */
export default function RequestsScreen() {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const { loaded, admin } = useManageAccess();
  const queue = useCorrectionQueue(admin);
  const items = queue.data ?? [];

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader title="Requests" subtitle="People asking to fix their records" />
      {loaded && !admin ? (
        <ManageNotAllowed />
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 32 }}
          refreshControl={<RefreshControl refreshing={queue.isRefetching} onRefresh={() => void queue.refetch()} tintColor={p.ink3} />}
        >
          {queue.isPending ? (
            <>
              <Skeleton height={220} />
              <Skeleton height={220} />
            </>
          ) : queue.isError && !queue.data ? (
            <Failed onRetry={() => queue.refetch()} />
          ) : items.length === 0 ? (
            <Empty
              icon="check"
              mood="proud"
              title="No open requests"
              body="When someone reports a wrong name, email or enrollment from their profile, it shows up here. Fix the record under People or in the timetable import, then mark it fixed."
            />
          ) : (
            items.map((c) => <RequestCard key={c.id} c={c} />)
          )}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

function RequestCard({ c }: { c: ManagedCorrection }) {
  const resolve = useResolveCorrection();
  const [response, setResponse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"resolved" | "declined" | null>(null);

  function answer(status: "resolved" | "declined") {
    if (status === "declined" && !response.trim()) return setError("Say why, so they know what to do next.");
    setError(null);
    setBusy(status);
    resolve.mutate(
      { id: c.id, status, response },
      {
        onError: (err) => {
          setError(errorDetail(err, "Couldn't save. Try again."));
          setBusy(null);
        },
      },
    );
  }

  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Avatar text={c.person.initials} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T variant="bodyStrong" numberOfLines={1}>
            {c.person.name}
          </T>
          <T variant="callout" tone="ink2" numberOfLines={2}>
            {c.person.email} · {c.topic_label} · {relativeTime(c.created_at)}
          </T>
        </View>
      </View>
      <T variant="body">{c.details}</T>
      <Field
        label="Reply (shown to them; needed when you decline)"
        value={response}
        onChangeText={setResponse}
        maxLength={500}
        placeholder="What you changed, or why not"
      />
      <FormError text={error} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button
          label="Decline"
          variant="secondary"
          style={{ flex: 1 }}
          busy={busy === "declined"}
          disabled={busy !== null}
          onPress={() => answer("declined")}
        />
        <Button
          label="Mark as fixed"
          style={{ flex: 1 }}
          busy={busy === "resolved"}
          disabled={busy !== null}
          onPress={() => answer("resolved")}
        />
      </View>
    </Card>
  );
}
