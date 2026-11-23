import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { Card, CourseTag, Divider, Empty, Failed, IconButton, Press, T } from "@/components/ui";
import { relativeTime } from "@/lib/format";
import { appRoute } from "@/lib/links";
import { type SearchHit, useSearch } from "@/lib/queries";
import { font, radius, useTheme } from "@/theme";

const GROUPS: Record<string, string> = {
  notices: "Notices",
  assignments: "Coursework",
  courses: "Courses",
  resources: "Resources",
  posts: "Feed",
  events: "Calendar",
  people: "People",
  messages: "Messages",
};

export default function Search() {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const query = useSearch(debounced);
  const groups = Object.entries(query.data?.results ?? {}).filter(([, hits]) => hits.length);

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 12, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <IconButton icon="back" label="Back" variant="plain" onPress={() => router.back()} />
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            minHeight: 46,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: p.line,
            backgroundColor: p.surface,
            paddingHorizontal: 14,
          }}
        >
          <Icon name="search" size={18} color={p.ink3} />
          <TextInput
            value={q}
            onChangeText={setQ}
            autoFocus
            returnKeyType="search"
            placeholder="Notices, coursework, people, chats…"
            placeholderTextColor={p.ink3}
            accessibilityLabel="Search CampusVerse"
            style={{ flex: 1, fontFamily: font.regular, fontSize: 16, color: p.ink, paddingVertical: 10 }}
          />
          {query.isFetching ? <ActivityIndicator size="small" color={p.ink3} /> : null}
        </View>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 20, paddingBottom: insets.bottom + 32 }}>
        {debounced.length < 2 ? (
          <Empty icon="search" title="Search everything" body="Notices, coursework, courses, files and events across your sections." />
        ) : query.isError && !query.data ? (
          <Failed onRetry={() => query.refetch()} />
        ) : query.data && !groups.length ? (
          <Empty icon="search" title={`Nothing for “${debounced}”`} body="Try fewer or different words." />
        ) : (
          groups.map(([type, hits]) => (
            <View key={type} style={{ gap: 8 }}>
              <T variant="caption" tone="ink3" accessibilityRole="header" style={{ textTransform: "uppercase", letterSpacing: 0.6, paddingHorizontal: 4 }}>
                {GROUPS[type] ?? type}
              </T>
              <Card padded={false}>
                {hits.map((h, i) => (
                  <View key={`${type}-${h.id}`}>
                    {i > 0 && <Divider inset={14} />}
                    <Hit h={h} />
                  </View>
                ))}
              </Card>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function Hit({ h }: { h: SearchHit }) {
  const route = appRoute(h.link);
  return (
    <Press
      scaleTo={0.99}
      accessibilityRole={route ? "button" : undefined}
      disabled={!route}
      onPress={() => route && router.push(route)}
      style={{ padding: 14, gap: 4 }}
    >
      {h.course ? <CourseTag color={h.color} label={h.course} /> : null}
      <T variant="bodyStrong">{h.title}</T>
      {h.snippet ? (
        <T variant="callout" tone="ink2" numberOfLines={2}>
          {h.snippet}
        </T>
      ) : null}
      <T variant="caption" tone="ink3" style={{ fontWeight: "400" }}>
        {[h.date ? relativeTime(h.date) : null, route ? null : "On the website"].filter(Boolean).join(" · ")}
      </T>
    </Press>
  );
}
