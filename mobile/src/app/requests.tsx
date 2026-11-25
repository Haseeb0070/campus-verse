import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StackHeader } from "@/components/StackHeader";
import { Button, Card, Divider, Empty, Failed, Pill, Skeleton, T, Toggle } from "@/components/ui";
import { errorDetail } from "@/lib/api";
import { formatDay, relativeTime } from "@/lib/format";
import { useMe } from "@/lib/queries";
import {
  type RepRequest,
  type RepsMine,
  repSummary,
  stageLabel,
  useRepAnswer,
  useRepRequests,
  useRepSettings,
  useRepsMine,
  waitingOn,
} from "@/lib/reps";
import { useTheme } from "@/theme";

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

function when(r: RepRequest) {
  const at = `${formatDay(r.date, { month: "short" })}${r.starts_at ? `, ${hhmm(r.starts_at)}` : ""}`;
  if (r.action === "shift" && r.new_date) {
    return `${at} → ${formatDay(r.new_date, { month: "short" })}${r.new_starts_at ? `, ${hhmm(r.new_starts_at)}` : ""}`;
  }
  return at;
}

/** Lectures cancelled or shifted on CR and GR call: approve or decline them, answer "Did you
 *  know?", and (teachers) whether they need approving at all. */
export default function Requests() {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const me = useMe().data;
  const mine = useRepsMine().data;
  const list = useRepRequests();
  const teacher = me?.sections.some((s) => s.teaching) ?? false;
  const waiting = waitingOn(list.data);
  const rest = (list.data ?? []).filter((r) => !(r.can_decide || r.can_reply));

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader title="Class requests" subtitle="Lectures cancelled or shifted on CR and GR call" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: insets.bottom + 32 }}>
        {teacher && mine ? <TeacherSettings mine={mine} /> : null}

        {list.isPending ? (
          <Skeleton height={160} />
        ) : list.isError && !list.data ? (
          <Failed onRetry={() => list.refetch()} />
        ) : !list.data?.length ? (
          <Empty
            icon="swap"
            title="No requests yet"
            body={
              teacher
                ? "When a CR or GR cancels or shifts one of your lectures, it shows here."
                : "Lectures you cancel or shift as CR or GR show here."
            }
          />
        ) : (
          <>
            <View style={{ gap: 8 }}>
              <T variant="caption" tone="ink3" accessibilityRole="header" style={{ textTransform: "uppercase", letterSpacing: 0.6, paddingHorizontal: 4 }}>
                Waiting for you
              </T>
              {waiting.length ? (
                <Card padded={false}>
                  {waiting.map((r, i) => (
                    <View key={r.id}>
                      {i > 0 && <Divider inset={16} />}
                      <RequestRow r={r} />
                    </View>
                  ))}
                </Card>
              ) : (
                <Card>
                  <T variant="body" tone="ink2">
                    Nothing right now.
                  </T>
                </Card>
              )}
            </View>
            {rest.length ? (
              <View style={{ gap: 8 }}>
                <T variant="caption" tone="ink3" accessibilityRole="header" style={{ textTransform: "uppercase", letterSpacing: 0.6, paddingHorizontal: 4 }}>
                  Recent
                </T>
                <Card padded={false}>
                  {rest.map((r, i) => (
                    <View key={r.id}>
                      {i > 0 && <Divider inset={16} />}
                      <RequestRow r={r} />
                    </View>
                  ))}
                </Card>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function RequestRow({ r }: { r: RepRequest }) {
  const answer = useRepAnswer();
  const pending = r.can_decide || r.can_reply;
  const detail = [
    `${r.course_code} · ${r.section_code} · ${when(r)}`,
    `asked ${relativeTime(r.created_at)}`,
    r.note ? `“${r.note}”` : "",
    r.teacher_reply === "known" ? "The teacher knew" : "",
    r.decided_by && !pending ? `${r.stage === "declined" ? "Declined" : "Approved"} by ${r.decided_by}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={{ padding: 16, gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <T variant="bodyStrong" style={{ flex: 1 }}>
          {repSummary(r)}
        </T>
        <Pill
          label={r.can_reply ? "Did you know?" : stageLabel[r.stage]}
          tone={pending ? "warn" : r.stage === "applied" ? "success" : "neutral"}
        />
      </View>
      <T variant="callout" tone="ink2">
        {detail}
      </T>
      {r.can_decide ? (
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button label="Approve" style={{ flex: 1 }} busy={answer.isPending} onPress={() => answer.mutate({ id: r.id, kind: "decide", yes: true })} />
          <Button label="Decline" variant="secondary" style={{ flex: 1 }} onPress={() => answer.mutate({ id: r.id, kind: "decide", yes: false })} />
        </View>
      ) : null}
      {r.can_reply ? (
        <>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button label="Yes, I knew" style={{ flex: 1 }} busy={answer.isPending} onPress={() => answer.mutate({ id: r.id, kind: "reply", yes: true })} />
            <Button label="No, undo it" variant="danger" style={{ flex: 1 }} onPress={() => answer.mutate({ id: r.id, kind: "reply", yes: false })} />
          </View>
          <T variant="caption" tone="ink3">
            “No” undoes it and stops {r.requester} changing your lectures.
          </T>
        </>
      ) : null}
      {answer.isError ? (
        <T variant="callout" tone="danger" accessibilityLiveRegion="polite">
          {errorDetail(answer.error, "That didn't work.")}
        </T>
      ) : null}
    </View>
  );
}

function TeacherSettings({ mine }: { mine: RepsMine }) {
  const save = useRepSettings();
  return (
    <Card style={{ gap: 12 }}>
      <T variant="headline">CR and GR changes to your lectures</T>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="body">Let them cancel and shift without asking me</T>
          <T variant="callout" tone="ink3">
            Off: you approve each change, at least 15 minutes before the lecture. On: it happens at once and you’re asked whether you knew.
          </T>
        </View>
        <Toggle
          label="Let CR and GR change my lectures without asking me"
          value={mine.without_approval}
          onChange={(v) => save.mutate({ without_approval: v })}
        />
      </View>
      {mine.blocked.length ? (
        <View style={{ gap: 6 }}>
          <T variant="calloutStrong" tone="ink2">
            You took changes back from
          </T>
          {mine.blocked.map((b) => (
            <View key={b.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <T variant="body" style={{ flex: 1 }}>
                {b.name}
              </T>
              <Button label="Allow again" variant="secondary" onPress={() => save.mutate({ unblock: b.id })} />
            </View>
          ))}
        </View>
      ) : null}
      {save.isError ? (
        <T variant="callout" tone="danger">
          {errorDetail(save.error, "Couldn't save. Try again.")}
        </T>
      ) : null}
    </Card>
  );
}
