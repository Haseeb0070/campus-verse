import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FilterChips, ManageNotAllowed } from "@/components/manage-bits";
import { StackHeader } from "@/components/StackHeader";
import { Card, Empty, Failed, Skeleton, T } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { type AuditEntry, useAudit, useManageAccess } from "@/lib/manage";
import { radius, useTheme } from "@/theme";

const FILTERS = [
  { value: "", label: "Everything" },
  { value: "person.", label: "People" },
  { value: "role.", label: "Roles" },
  { value: "grade", label: "Grades" },
  { value: "schedule.", label: "Timetable" },
  { value: "import.", label: "Imports" },
  { value: "notice.", label: "Notices" },
  { value: "chat.", label: "Moderation" },
];

function describe(changes: Record<string, unknown>) {
  return Object.entries(changes)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(" → ") : typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

/** The audit log: append-only, filtered by what kind of change. */
export default function AuditScreen() {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const { me, loaded, admin } = useManageAccess();
  const tz = me?.institution?.timezone;
  const [action, setAction] = useState("");
  const entries = useAudit(action, admin);

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader title="Audit log" subtitle="Append-only: entries can't be edited or deleted" />
      {loaded && !admin ? (
        <ManageNotAllowed />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 32 }}
          refreshControl={<RefreshControl refreshing={entries.isRefetching} onRefresh={() => void entries.refetch()} tintColor={p.ink3} />}
        >
          <FilterChips label="Filter" options={FILTERS} value={action} onChange={setAction} />
          {entries.isPending ? (
            <>
              <Skeleton height={96} />
              <Skeleton height={96} />
              <Skeleton height={96} />
            </>
          ) : entries.isError && !entries.data ? (
            <Failed onRetry={() => entries.refetch()} />
          ) : !entries.data?.length ? (
            <Empty icon="clipboard" title="No entries." />
          ) : (
            entries.data.map((e) => <EntryCard key={e.id} e={e} tz={tz} />)
          )}
        </ScrollView>
      )}
    </View>
  );
}

function EntryCard({ e, tz }: { e: AuditEntry; tz?: string }) {
  const p = useTheme();
  const details = describe(e.changes);
  return (
    <Card style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
        <T variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
          {e.actor ?? "System"}
        </T>
        <T variant="caption" tone="ink3" style={{ fontWeight: "400", fontVariant: ["tabular-nums"] }}>
          {formatDateTime(e.created_at, tz)}
        </T>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <View style={{ backgroundColor: p.fill, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 }}>
          <T variant="caption">{e.action}</T>
        </View>
        <T variant="callout" tone="ink2">
          {e.target_type.split(".").pop()} {e.target_id}
        </T>
      </View>
      {details ? (
        <T variant="callout" tone="ink2" selectable>
          {details}
        </T>
      ) : null}
    </Card>
  );
}
