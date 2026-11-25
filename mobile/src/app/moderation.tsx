import { router } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FormError } from "@/components/form";
import { StackHeader } from "@/components/StackHeader";
import { Button, Card, Empty, Failed, Field, Pill, Press, Skeleton, T } from "@/components/ui";
import { errorDetail } from "@/lib/api";
import { type QueuedReport, REPORT_REASONS, useModerationSummary, useReports, useResolveReport } from "@/lib/feed";
import { relativeTime } from "@/lib/format";
import { radius, useTheme } from "@/theme";

const REASON = Object.fromEntries(REPORT_REASONS.map((r) => [r.key, r.label])) as Record<string, string>;

/** Open reports on the campus feed: dismiss them, or hide or remove what was reported. */
export default function ModerationScreen() {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const summary = useModerationSummary().data;
  const reports = useReports(summary?.can_moderate !== false);

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader title="Moderation" subtitle={summary?.open ? `${summary.open} open ${summary.open === 1 ? "report" : "reports"}` : "Reports on the campus feed"} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 32 }}>
        {summary && !summary.can_moderate ? (
          <Empty icon="flag" title="Not for you" body="Moderation is for the college's moderators." />
        ) : reports.isPending ? (
          <>
            <Skeleton height={200} />
            <Skeleton height={200} />
          </>
        ) : reports.isError && !reports.data ? (
          <Failed onRetry={() => reports.refetch()} />
        ) : !reports.data?.length ? (
          <Empty icon="check" mood="proud" title="Nothing to look at" body="Reports from the campus feed show here." />
        ) : (
          reports.data.map((r) => <ReportCard key={r.id} r={r} />)
        )}
        <T variant="caption" tone="ink3" style={{ fontWeight: "400", paddingHorizontal: 4 }}>
          Every decision is recorded with your note. Authors are told when their content is hidden or removed, but not who reported it.
        </T>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ReportCard({ r }: { r: QueuedReport }) {
  const p = useTheme();
  const resolve = useResolveReport();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function go(action: "dismiss" | "hide" | "remove") {
    setError(null);
    resolve.mutate({ id: r.id, action, note: note.trim() }, { onError: (err) => setError(errorDetail(err, "That didn't work. Try again.")) });
  }

  function remove() {
    Alert.alert(`Remove this ${r.target_type} for good?`, "Nobody sees it again, apart from its author's notice that it was removed.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => go("remove") },
    ]);
  }

  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <Pill label={REASON[r.reason] ?? r.reason} tone="danger" icon="flag" />
        {r.reports_on_target > 1 ? <Pill label={`${r.reports_on_target} reports`} tone="warn" /> : null}
      </View>
      <T variant="callout" tone="ink3">
        Reported by {r.reporter} · {relativeTime(r.created_at)}
      </T>
      {r.details ? (
        <T variant="callout" tone="ink2">
          “{r.details}”
        </T>
      ) : null}
      <Press
        accessibilityRole="button"
        accessibilityLabel={`${r.target_type === "post" ? "Post" : "Comment"} by ${r.author}: ${r.body}. See it in the feed`}
        onPress={() => router.push({ pathname: "/feed/[id]", params: { id: String(r.post_id) } })}
        scaleTo={0.99}
        style={{ backgroundColor: p.fill, borderRadius: radius.md, padding: 12, gap: 4 }}
      >
        <T variant="caption" tone="ink3">
          {r.target_type === "post" ? "Post" : "Comment"} by {r.author}
          {r.visibility === "hidden" ? " · already hidden" : ""}
        </T>
        <T variant="body" numberOfLines={6}>
          {r.body}
        </T>
        <T variant="calloutStrong" tone="accentInk">
          See it in the feed
        </T>
      </Press>
      <Field label="Note for the record (the author sees it if you hide or remove)" value={note} onChangeText={setNote} maxLength={500} placeholder="Breaks the academic integrity policy" />
      <FormError text={error} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button label="Dismiss" variant="secondary" style={{ flex: 1 }} disabled={resolve.isPending} onPress={() => go("dismiss")} />
        <Button label="Hide" style={{ flex: 1 }} disabled={resolve.isPending} onPress={() => go("hide")} />
      </View>
      <Button label="Remove for good" variant="danger" disabled={resolve.isPending} onPress={remove} />
    </Card>
  );
}
