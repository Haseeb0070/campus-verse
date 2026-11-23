import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { StackHeader } from "@/components/StackHeader";
import { Button, Card, Divider, Failed, Pill, Skeleton, T } from "@/components/ui";
import { openFile } from "@/lib/files";
import { fileSize, formatDateTime, relativeTime } from "@/lib/format";
import { useMe } from "@/lib/queries";
import { resourceFilePath, useResource } from "@/lib/resources";
import type { StoredFileInfo } from "@/lib/types";
import { font, radius, useTheme } from "@/theme";

export default function ResourceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const tz = useMe().data?.institution?.timezone;
  const query = useResource(Number(id));
  const r = query.data;
  const [opening, setOpening] = useState(false);

  async function open(file: StoredFileInfo) {
    setOpening(true);
    try {
      await openFile(resourceFilePath(file.id), file.name, file.content_type);
    } catch {
      Alert.alert("Couldn't open the file", "Check your connection and try again.");
    } finally {
      setOpening(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader title={r?.title ?? "Material"} subtitle={r ? `${r.course_code} · ${r.course_title}` : undefined} />
      {query.isPending ? (
        <View style={{ padding: 16, gap: 12 }}>
          <Skeleton height={170} />
          <Skeleton height={120} />
        </View>
      ) : query.isError || !r ? (
        <Failed onRetry={() => query.refetch()} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 32 }}>
          <View style={{ backgroundColor: p.field, borderRadius: radius.xl, padding: 20, gap: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <View style={{ backgroundColor: p.fieldLine, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                <T variant="caption" tone="onField" style={{ fontFamily: font.bold }}>
                  {r.course_code} · {r.kind_label}
                </T>
              </View>
              {r.status === "archived" ? <Pill label="Archived" /> : null}
            </View>
            <T tone="onField" style={{ fontFamily: font.display, fontSize: 26, lineHeight: 30 }}>
              {r.title}
            </T>
            <T variant="callout" tone="onFieldMuted">
              Shared by {r.shared_by} · updated {relativeTime(r.updated_at)}
              {r.audiences.length ? ` · for ${r.audiences.join(", ")}` : ""}
            </T>
            {r.file ? (
              <Button
                label={opening ? "Opening…" : `Open ${r.file.name}`}
                icon="file"
                busy={opening}
                onPress={() => open(r.file!)}
              />
            ) : r.url ? (
              <Button label="Open link" icon="online" onPress={() => Linking.openURL(r.url)} />
            ) : null}
            {r.file ? (
              <T variant="caption" tone="onFieldMuted" style={{ fontWeight: "400", textAlign: "center" }}>
                {fileSize(r.file.size)}
                {r.version > 1 ? ` · version ${r.version}` : ""}
              </T>
            ) : r.url ? (
              <T variant="caption" tone="onFieldMuted" numberOfLines={1} style={{ fontWeight: "400", textAlign: "center" }}>
                {r.url}
              </T>
            ) : null}
          </View>

          {r.description ? (
            <Card style={{ gap: 8 }}>
              <T variant="headline">About this</T>
              <T variant="body" tone="ink2" selectable>
                {r.description}
              </T>
            </Card>
          ) : null}

          {r.versions.length > 1 ? (
            <Card style={{ gap: 4 }}>
              <T variant="headline" style={{ marginBottom: 6 }}>
                Earlier versions
              </T>
              {r.versions
                .filter((v) => v.number !== r.version)
                .sort((a, b) => b.number - a.number)
                .map((v, i) => (
                  <View key={v.number}>
                    {i > 0 && <Divider />}
                    <VersionRow
                      label={`Version ${v.number}`}
                      detail={`${v.uploaded_by} · ${formatDateTime(v.created_at, tz)}${v.note ? ` · ${v.note}` : ""}`}
                      onPress={() => open(v.file)}
                    />
                  </View>
                ))}
            </Card>
          ) : null}
          {opening ? <ActivityIndicator color={p.accent} /> : null}
        </ScrollView>
      )}
    </View>
  );
}

function VersionRow({ label, detail, onPress }: { label: string; detail: string; onPress: () => void }) {
  const p = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${label}. ${detail}`}
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, minHeight: 48 }}
    >
      <Icon name="file" size={18} color={p.ink2} />
      <View style={{ flex: 1 }}>
        <T variant="bodyStrong">{label}</T>
        <T variant="caption" tone="ink3" style={{ fontWeight: "400" }} numberOfLines={2}>
          {detail}
        </T>
      </View>
      <Icon name="chevron" size={16} color={p.ink3} />
    </Pressable>
  );
}
