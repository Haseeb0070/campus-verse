import { router } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Icon } from "@/components/Icon";
import { HeaderActions, Screen } from "@/components/Screen";
import { Card, CourseTag, Empty, Failed, Press, Segmented, Skeleton, T } from "@/components/ui";
import { formatDateTime, relativeTime } from "@/lib/format";
import { useNow } from "@/lib/now";
import { useAssignments, useMe } from "@/lib/queries";
import type { Assignment } from "@/lib/types";
import { useTheme } from "@/theme";

type Tab = "teaching" | "due" | "in" | "marked";

/** Where a student stands on a piece of work, in a few words. */
export function standing(a: Assignment): { label: string; tone: "ink3" | "accentInk" | "danger" } {
  const tried = (a.my_attempts ?? 0) > 0;
  if (a.my_grade && a.grades_released) return { label: `${a.my_grade.points} / ${a.max_points}`, tone: "accentInk" };
  if (tried) return { label: "Handed in", tone: "ink3" };
  if (a.window === "late") return { label: "Late", tone: "danger" };
  if (a.window === "closed") return { label: "Missed", tone: "danger" };
  if (a.window === "not_open") return { label: "Opens soon", tone: "ink3" };
  return { label: "Not started", tone: "ink3" };
}

export default function Work() {
  const me = useMe().data;
  const tz = me?.institution?.timezone;
  const query = useAssignments();
  const all = useMemo(() => query.data ?? [], [query.data]);
  const teaches = all.some((a) => a.can_manage);
  // Someone who only teaches starts on what they teach; everyone else on what's due.
  const [picked, setTab] = useState<Tab | null>(null);
  const tab: Tab = picked ?? (teaches && !all.some((a) => !a.can_manage) ? "teaching" : "due");

  const mine = all.filter((a) => !a.can_manage && a.status === "published");
  const lists: Record<Tab, Assignment[]> = {
    teaching: all.filter((a) => a.can_manage).sort((a, b) => b.due_at.localeCompare(a.due_at)),
    due: mine
      .filter((a) => !(a.my_attempts ?? 0) && a.window !== "closed")
      .sort((a, b) => a.due_at.localeCompare(b.due_at)),
    in: mine
      .filter((a) => (a.my_attempts ?? 0) > 0 && !(a.my_grade && a.grades_released))
      .sort((a, b) => b.due_at.localeCompare(a.due_at)),
    marked: mine.filter((a) => a.my_grade && a.grades_released).sort((a, b) => b.due_at.localeCompare(a.due_at)),
  };
  const missed = mine.filter((a) => !(a.my_attempts ?? 0) && a.window === "closed");
  const courses = new Set(all.map((a) => a.course_code)).size;

  const options: { key: Tab; label: string; count?: number }[] = [
    ...(teaches ? [{ key: "teaching" as const, label: "Teaching" }] : []),
    { key: "due", label: "Due", count: lists.due.length || undefined },
    { key: "in", label: "Handed in" },
    { key: "marked", label: "Marked" },
  ];
  const list = lists[tab];
  // Verse: worried by anything overdue, proud of a clear list.
  const now = useNow();
  const overdue = lists.due.some((a) => new Date(a.due_at).getTime() < now);
  const verse = overdue ? "scared" : !teaches && query.data && !lists.due.length ? "proud" : "calm";

  return (
    <Screen
      eyebrow={courses ? `${courses} ${courses === 1 ? "course" : "courses"}` : undefined}
      title="Coursework"
      actions={<HeaderActions />}
      verse={verse}
      refreshKeys={[["assignments"], ["progress"]]}
      below={
        <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
          <Segmented value={tab} onChange={setTab} options={options} />
        </View>
      }
    >
      <View style={{ paddingHorizontal: 16, gap: 12 }}>
        {query.isPending ? (
          <>
            <Skeleton height={104} />
            <Skeleton height={104} />
          </>
        ) : query.isError ? (
          <Failed onRetry={() => query.refetch()} />
        ) : list.length === 0 ? (
          <Empty
            icon="clipboard"
            mood={tab === "due" ? "proud" : "calm"}
            title={{ teaching: "No assignments yet", due: "You're all caught up", in: "Nothing handed in yet", marked: "No marks yet" }[tab]}
            body={
              {
                teaching: "Create assignments on the CampusVerse website; they show here to follow.",
                due: "Nothing is waiting for you right now.",
                in: "Work you hand in waits here until it's marked.",
                marked: "Marks show here once your teacher releases them.",
              }[tab]
            }
          />
        ) : (
          list.map((a) => <WorkCard key={a.id} a={a} tz={tz} />)
        )}

        {tab === "due" && missed.length ? (
          <T variant="callout" tone="ink3" style={{ paddingHorizontal: 4 }}>
            {missed.length} closed without a hand-in. Ask your teacher if you think that’s wrong.
          </T>
        ) : null}

        {!teaches || mine.length ? <ProgressLink /> : null}
      </View>
    </Screen>
  );
}

function WorkCard({ a, tz }: { a: Assignment; tz?: string }) {
  const p = useTheme();
  const s = standing(a);
  const late = a.window === "late" && !(a.my_attempts ?? 0);
  const files = a.submission_type !== "text";
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={`${a.title}, ${a.course_code}. ${a.can_manage ? `${a.submitted_count ?? 0} of ${a.student_count ?? 0} handed in` : s.label}. Due ${formatDateTime(a.due_at, tz)}.`}
      onPress={() => router.push({ pathname: "/assignment/[id]", params: { id: String(a.id) } })}
    >
      <Card style={{ gap: 8, paddingHorizontal: 16 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <CourseTag color={a.color} label={`${a.course_code} · ${a.section_code}`} />
          {a.can_manage ? (
            <T variant="caption" tone="ink3">
              {a.status === "draft" ? "Draft" : `${a.submitted_count ?? 0}/${a.student_count ?? 0} in`}
            </T>
          ) : (
            <T variant="caption" tone={s.tone}>
              {s.label}
            </T>
          )}
        </View>
        <T variant="headline">{a.title}</T>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon name={late ? "clock" : files ? "attach" : "pencil"} size={14} color={late ? p.danger : p.ink2} />
          <T variant="callout" tone={late ? "danger" : "ink2"}>
            {late
              ? `Was due ${relativeTime(a.due_at)} · late hand-ins allowed`
              : `Due ${formatDateTime(a.due_at, tz)}`}
          </T>
        </View>
      </Card>
    </Press>
  );
}

function ProgressLink() {
  const p = useTheme();
  return (
    <View style={{ marginTop: 12, gap: 10 }}>
      <T variant="title" accessibilityRole="header" style={{ fontSize: 22 }}>
        Courses
      </T>
      <Press accessibilityRole="button" onPress={() => router.push("/resources")}>
        <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: p.accentSoft, alignItems: "center", justifyContent: "center" }}>
            <Icon name="file" size={20} color={p.accentInk} />
          </View>
          <View style={{ flex: 1 }}>
            <T variant="bodyStrong">Course materials</T>
            <T variant="callout" tone="ink3">
              Slides, notes, readings and links from your teachers
            </T>
          </View>
          <Icon name="chevron" size={18} color={p.ink3} />
        </Card>
      </Press>
      <Press accessibilityRole="button" onPress={() => router.push("/progress")}>
        <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: p.accentSoft, alignItems: "center", justifyContent: "center" }}>
            <Icon name="chart" size={20} color={p.accentInk} />
          </View>
          <View style={{ flex: 1 }}>
            <T variant="bodyStrong">Released marks and attendance</T>
            <T variant="callout" tone="ink3">
              Course by course, as your teachers release them
            </T>
          </View>
          <Icon name="chevron" size={18} color={p.ink3} />
        </Card>
      </Press>
    </View>
  );
}
