import { useState } from "react";
import { KeyboardAvoidingView, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DownloadRow } from "@/components/files";
import { FilterChips, ManageNotAllowed } from "@/components/manage-bits";
import { StackHeader } from "@/components/StackHeader";
import { Card, Divider, Empty, Failed, Field, Pill, Skeleton, T } from "@/components/ui";
import { relativeTime } from "@/lib/format";
import { useDebounced, useDepartmentPeople, useManageAccess } from "@/lib/manage";
import { useTheme } from "@/theme";

const KINDS: { value: "" | "student" | "teacher"; label: string }[] = [
  { value: "", label: "Everyone" },
  { value: "student", label: "Students" },
  { value: "teacher", label: "Teachers" },
];

/** For department coordinators: the students and teachers in their departments' subjects. */
export default function DepartmentPeopleScreen() {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const { loaded, admin, coordinator } = useManageAccess();
  const allowed = admin || coordinator;
  const [typed, setTyped] = useState("");
  const q = useDebounced(typed.trim());
  const [kind, setKind] = useState<"" | "student" | "teacher">("");
  const people = useDepartmentPeople(q, kind, allowed);

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader title="Department people" subtitle="Students and teachers in your departments' subjects" />
      {loaded && !allowed ? (
        <ManageNotAllowed />
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 32 }}
          refreshControl={<RefreshControl refreshing={people.isRefetching} onRefresh={() => void people.refetch()} tintColor={p.ink3} />}
        >
          <Field
            label="Search people"
            value={typed}
            onChangeText={setTyped}
            placeholder="Search by name, email or college ID"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          <FilterChips label="Show" options={KINDS} value={kind} onChange={setKind} />
          <Card style={{ paddingVertical: 4 }}>
            <DownloadRow
              label="Download (Excel)"
              path={`/api/manage/structure/department/people.csv${kind ? `?kind=${kind}` : ""}`}
              name={`department-people${kind ? `-${kind}` : ""}.csv`}
            />
          </Card>

          {people.isPending ? (
            <Skeleton height={240} />
          ) : people.isError && !people.data ? (
            (people.error as { status?: number } | null)?.status === 403 ? (
              <Empty icon="people" title="This page is for department coordinators and admins." />
            ) : (
              <Failed onRetry={() => people.refetch()} />
            )
          ) : !people.data?.length ? (
            <Empty icon="search" title="Nobody matches." />
          ) : (
            <Card padded={false} style={{ opacity: people.isFetching && !people.isRefetching ? 0.6 : 1 }}>
              {people.data.map((x, i) => (
                <View key={x.id}>
                  {i > 0 && <Divider inset={14} />}
                  <View style={{ padding: 14, gap: 6 }}>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                      <T variant="bodyStrong">{x.name}</T>
                      <Pill label={x.kind[0].toUpperCase() + x.kind.slice(1)} />
                      {x.external_id ? (
                        <T variant="callout" tone="ink3">
                          {x.external_id}
                        </T>
                      ) : null}
                    </View>
                    <T variant="callout" tone="ink2">
                      {x.email} · {x.sections} {x.sections === 1 ? "subject" : "subjects"} ·{" "}
                      {x.last_login ? `last signed in ${relativeTime(x.last_login)}` : "never signed in"}
                    </T>
                  </View>
                </View>
              ))}
            </Card>
          )}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}
