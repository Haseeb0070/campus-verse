import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, ScrollView, TextInput, View } from "react-native";
import { Icon } from "@/components/Icon";
import { StackHeader } from "@/components/StackHeader";
import { Card, Chip, CourseTag, Empty, Failed, Press, Skeleton, T } from "@/components/ui";
import { relativeTime } from "@/lib/format";
import { KIND_LABEL, type Resource, type ResourceKind, useResources } from "@/lib/resources";
import { font, radius, useTheme } from "@/theme";

const KINDS = Object.keys(KIND_LABEL) as ResourceKind[];

/** Course material teachers share: slides, notes, readings and links, for your sections. */
export default function Resources() {
  const p = useTheme();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [offering, setOffering] = useState<number | null>(null);
  const [kind, setKind] = useState<ResourceKind | "">("");
  const [archived, setArchived] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSearch(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const query = useResources({ status: archived ? "archived" : "active", offering, kind, q: search });
  // Courses to filter by: the ones your material comes from, kept while a filter narrows the list.
  const all = useResources({ status: archived ? "archived" : "active" });
  const courses = useMemo(() => {
    const seen = new Map<number, { id: number; code: string }>();
    for (const r of all.data ?? []) seen.set(r.offering_id, { id: r.offering_id, code: r.course_code });
    return [...seen.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [all.data]);

  const list = query.data ?? [];
  const filtered = !!(offering || kind || search.trim());

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader title="Course materials" subtitle="Slides, notes, readings and links from your teachers" />
      <FlatList
        data={list}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onRefresh={() => query.refetch()}
        refreshing={query.isRefetching && !query.isPlaceholderData}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 4 }}>
            <View
              style={{
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
                placeholder="Search titles and descriptions"
                placeholderTextColor={p.ink3}
                accessibilityLabel="Search course materials"
                returnKeyType="search"
                style={{ flex: 1, fontFamily: font.regular, fontSize: 15, color: p.ink, paddingVertical: 10 }}
              />
            </View>
            {courses.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                <Chip label="All courses" on={offering === null} onPress={() => setOffering(null)} />
                {courses.map((c) => (
                  <Chip key={c.id} label={c.code} on={offering === c.id} onPress={() => setOffering(offering === c.id ? null : c.id)} />
                ))}
              </ScrollView>
            ) : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Chip label="Every type" on={kind === ""} onPress={() => setKind("")} />
              {KINDS.map((k) => (
                <Chip key={k} label={KIND_LABEL[k]} on={kind === k} onPress={() => setKind(kind === k ? "" : k)} />
              ))}
              <Chip label="Archived" on={archived} onPress={() => setArchived((v) => !v)} />
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          query.isPending ? (
            <View style={{ gap: 10 }}>
              <Skeleton height={96} />
              <Skeleton height={96} />
              <Skeleton height={96} />
            </View>
          ) : query.isError ? (
            <Failed onRetry={() => query.refetch()} />
          ) : (
            <Empty
              icon="file"
              title={filtered ? "Nothing matches" : archived ? "Nothing archived" : "No materials yet"}
              body={
                filtered
                  ? "Try another course, type or search."
                  : archived
                    ? "Material your teachers archive stays findable here."
                    : "When your teachers share slides, notes or links, they show up here."
              }
            />
          )
        }
        renderItem={({ item }) => <ResourceRow r={item} />}
      />
    </View>
  );
}

function ResourceRow({ r }: { r: Resource }) {
  const p = useTheme();
  const isLink = !r.file && !!r.url;
  return (
    <Press
      scaleTo={0.99}
      accessibilityRole="button"
      accessibilityLabel={`${r.title}, ${r.kind_label}, ${r.course_code}. Shared by ${r.shared_by}, ${relativeTime(r.updated_at)}.`}
      onPress={() => router.push({ pathname: "/resources/[id]", params: { id: String(r.id) } })}
    >
      <Card style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: p.accentSoft, alignItems: "center", justifyContent: "center" }}>
          <Icon name={isLink ? "online" : "file"} size={20} color={p.accentInk} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <CourseTag color={r.color} label={r.course_code} />
            <T variant="caption" tone="ink3">
              {r.kind_label}
            </T>
          </View>
          <T variant="bodyStrong" numberOfLines={2}>
            {r.title}
          </T>
          <T variant="callout" tone="ink3" numberOfLines={1}>
            {r.shared_by} · {relativeTime(r.updated_at)}
            {r.version > 1 ? ` · version ${r.version}` : ""}
          </T>
        </View>
      </Card>
    </Press>
  );
}
