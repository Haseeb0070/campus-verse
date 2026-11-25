import { router } from "expo-router";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tileLabel } from "@/components/conversations";
import { StackHeader } from "@/components/StackHeader";
import { Avatar, Button, Card, Empty, Failed, Press, Skeleton, T } from "@/components/ui";
import { useConversations } from "@/lib/chat";
import { useTeaching } from "@/lib/coursework";
import type { SectionSummary } from "@/lib/types";
import { useTheme } from "@/theme";

/** The subjects a teacher teaches: who's in each, its chat, and setting work for it. */
export default function SubjectsScreen() {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const sections = useTeaching();
  const conversations = useConversations();
  const chatFor = (sectionId: number) => conversations.data?.find((c) => c.section_id === sectionId)?.id;

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader title="Your subjects" subtitle="Subjects you teach" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 32 }}>
        {sections.isPending ? (
          <>
            <Skeleton height={150} />
            <Skeleton height={150} />
          </>
        ) : sections.isError && !sections.data ? (
          <Failed onRetry={() => sections.refetch()} />
        ) : !sections.data?.length ? (
          <Empty icon="people" title="You're not teaching any subjects" body="Subjects appear here once your admin assigns you to them." />
        ) : (
          sections.data.map((s) => <SubjectCard key={s.id} s={s} chatId={chatFor(s.id)} />)
        )}
      </ScrollView>
    </View>
  );
}

function SubjectCard({ s, chatId }: { s: SectionSummary; chatId?: number }) {
  const roster = () => router.push({ pathname: "/subjects/[id]", params: { id: String(s.id) } });
  return (
    <Card style={{ gap: 14 }}>
      <Press
        accessibilityRole="button"
        accessibilityLabel={`${s.course_title}, ${s.course_code} ${s.code}. ${s.students} students. Open the roster`}
        onPress={roster}
        scaleTo={0.99}
        style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
      >
        <Avatar text={tileLabel(s.course_code)} color={s.color} size={48} />
        <View style={{ flex: 1 }}>
          <T variant="headline" numberOfLines={1}>
            {s.course_title}
          </T>
          <T variant="callout" tone="ink3">
            {s.course_code} · {s.code} · {s.term}
          </T>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <T variant="headline">{s.students}</T>
          <T variant="caption" tone="ink3">
            {s.students === 1 ? "student" : "students"}
          </T>
        </View>
      </Press>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Button label="Roster" icon="people" style={{ flexGrow: 1 }} onPress={roster} />
        {chatId ? (
          <Button
            label="Chat"
            icon="chat"
            variant="secondary"
            style={{ flexGrow: 1 }}
            onPress={() => router.push({ pathname: "/chat/[id]", params: { id: String(chatId) } })}
          />
        ) : null}
        <Button
          label="Set work"
          icon="clipboard"
          variant="secondary"
          style={{ flexGrow: 1 }}
          onPress={() => router.push({ pathname: "/assignment/edit", params: { section: String(s.id) } })}
        />
      </View>
    </Card>
  );
}
