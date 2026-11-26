import { type ReactNode, useState } from "react";
import { ScrollView, View } from "react-native";
import { Stagger } from "@/components/Stagger";
import Animated, { LinearTransition, useReducedMotion } from "react-native-reanimated";
import { HeaderActions, Screen } from "@/components/Screen";
import { Button, Chip, Empty, Failed, Press, Skeleton, T } from "@/components/ui";
import { router } from "expo-router";
import { FileRow } from "@/components/files";
import { formatDateTime, relativeTime } from "@/lib/format";
import { noticeFilePath, useMyNotices, useNoticeAudiences } from "@/lib/notices";
import { useNow } from "@/lib/now";
import { useMe, useNotices } from "@/lib/queries";
import type { Notice } from "@/lib/types";
import { font, useTheme } from "@/theme";

type Filter = "all" | "important" | "week";

export default function Notices() {
  const me = useMe().data;
  const tz = me?.institution?.timezone;
  const query = useNotices(100);
  const [filter, setFilter] = useState<Filter>("all");
  // Teachers (and anyone else who may post somewhere) write notices from here.
  const canPost = (useNoticeAudiences().data?.length ?? 0) > 0;
  const mine = useMyNotices(canPost).data?.filter((n) => n.status !== "archived") ?? [];

  const weekAgo = useNow(60_000) - 7 * 24 * 3600_000;
  const list = (query.data ?? []).filter((n) =>
    filter === "important"
      ? n.priority === "important"
      : filter === "week"
        ? !!n.published_at && new Date(n.published_at).getTime() >= weekAgo
        : true,
  );

  return (
    <Screen
      eyebrow="Your board"
      title="Notices"
      actions={<HeaderActions />}
      verse="reading"
      refreshKeys={[["notices"]]}
      below={
        <>
        {canPost ? (
          <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingBottom: 12 }}>
            <Button label="New notice" icon="plus" style={{ flex: 1 }} onPress={() => router.push("/notice/edit")} />
            {mine.length ? (
              <Button label={`Yours (${mine.length})`} variant="secondary" style={{ flex: 1 }} onPress={() => router.push("/notice/mine")} />
            ) : null}
          </View>
        ) : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 16 }}>
          <Chip label="All" on={filter === "all"} onPress={() => setFilter("all")} />
          <Chip label="Important" on={filter === "important"} onPress={() => setFilter("important")} />
          <Chip label="This week" on={filter === "week"} onPress={() => setFilter("week")} />
        </ScrollView>
        </>
      }
    >
      <Board>
        {query.isPending ? (
          <>
            <Skeleton height={130} />
            <Skeleton height={130} />
          </>
        ) : query.isError && !query.data ? (
          <Failed onRetry={() => query.refetch()} />
        ) : list.length === 0 ? (
          <Empty
            icon="pin"
            title={filter === "all" ? "No notices" : "Nothing here"}
            body={filter === "all" ? "Notices from your college, department and teachers appear here." : "Try another filter."}
          />
        ) : (
          list.map((n, i) => (
            <Stagger key={n.id} index={i}>
              <NoticeCard n={n} tz={tz} tilt={TILTS[i % TILTS.length]} />
            </Stagger>
          ))
        )}
      </Board>
    </Screen>
  );
}

const TILTS = ["-0.6deg", "0.5deg", "-0.3deg", "0.4deg"];

/** The cork-coloured board the notes are pinned to, as in the design. */
function Board({ children }: { children: ReactNode }) {
  const p = useTheme();
  const light = p.mode === "light";
  return (
    <View
      style={{
        flexGrow: 1,
        minHeight: 420,
        backgroundColor: light ? "#dccdb0" : "#2a251e",
        borderTopWidth: 1,
        borderTopColor: light ? "#cbb994" : "#3a332a",
        paddingTop: 26,
        paddingHorizontal: 18,
        paddingBottom: 24,
        gap: 22,
        marginBottom: -28,
      }}
    >
      {children}
    </View>
  );
}

function NoticeCard({ n, tz, tilt }: { n: Notice; tz?: string; tilt: string }) {
  const p = useTheme();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const long = n.body.length > 180;
  const important = n.priority === "important";
  const light = p.mode === "light";
  return (
    <Animated.View layout={reduced ? undefined : LinearTransition.springify().damping(22)} style={{ transform: [{ rotate: open ? "0deg" : tilt }] }}>
      <Press
        scaleTo={0.99}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${important ? "Important. " : ""}${n.title}. From ${n.author_name}${
          n.published_at ? `, ${relativeTime(n.published_at)}` : ""
        }. ${open || !long ? n.body : `${n.body.slice(0, 160)}…`}`}
        disabled={!long}
        onPress={() => setOpen((v) => !v)}
        style={{
          backgroundColor: light ? "#fffcf3" : "#24211c",
          borderRadius: 6,
          paddingTop: 18,
          paddingHorizontal: 16,
          paddingBottom: 16,
          gap: 6,
          shadowColor: "#3c2d14",
          shadowOpacity: light ? 0.28 : 0.5,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 4,
        }}
      >
        <View
          style={{
            position: "absolute",
            top: -9,
            left: "50%",
            marginLeft: -9,
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: important ? p.accent : light ? "#8f8270" : "#6b6153",
            shadowColor: "#3c2d14",
            shadowOpacity: 0.35,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 2 },
            elevation: 3,
          }}
        />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <T variant="caption" tone="ink3" numberOfLines={1} style={{ flexShrink: 1, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {n.author_name}
            {n.published_at ? ` · ${relativeTime(n.published_at)}` : ""}
          </T>
          {important ? (
            <T variant="caption" tone="accentInk" style={{ fontSize: 11, fontFamily: font.bold, letterSpacing: 0.5 }}>
              IMPORTANT
            </T>
          ) : null}
        </View>
        <T style={{ fontFamily: font.display, fontSize: 21, lineHeight: 25, color: p.ink }}>{n.title}</T>
        <T variant="body" tone="ink2" numberOfLines={open ? undefined : 4} selectable={open}>
          {n.body}
        </T>
        {n.attachments?.length && (open || !long) ? (
          <View style={{ marginTop: 4 }}>
            {n.attachments.map((f) => (
              <FileRow key={f.id} f={f} path={noticeFilePath(f.id)} />
            ))}
          </View>
        ) : n.attachments?.length ? (
          <T variant="caption" tone="ink3">
            {n.attachments.length} {n.attachments.length === 1 ? "file" : "files"} attached
          </T>
        ) : null}
        {long ? (
          <T variant="calloutStrong" tone="accentInk">
            {open ? "Show less" : "Read more"}
          </T>
        ) : null}
        {open && n.published_at ? (
          <T variant="caption" tone="ink3" style={{ fontWeight: "400" }}>
            Published {formatDateTime(n.published_at, tz)}
          </T>
        ) : null}
      </Press>
    </Animated.View>
  );
}
