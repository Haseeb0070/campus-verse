import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, View } from "react-native";
import type { UploadFile } from "@/lib/api";
import { openFile } from "@/lib/files";
import { fileSize } from "@/lib/format";
import type { StoredFileInfo } from "@/lib/types";
import { useTheme } from "@/theme";
import { Icon, type IconName } from "./Icon";
import { IconButton, T } from "./ui";

/**
 * One file: a stored one (opened through its download path, with the session token) or one just
 * picked to upload. Optionally removable.
 */
export function FileRow({
  f,
  path,
  onRemove,
}: {
  f: StoredFileInfo | UploadFile;
  /** Where a stored file downloads from, e.g. "/api/notices/files/4". */
  path?: string;
  onRemove?: () => void;
}) {
  const p = useTheme();
  const [busy, setBusy] = useState(false);
  const openable = !!path && "id" in f;
  const size = "size" in f && f.size ? fileSize(f.size) : "";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 }}>
      <Pressable
        accessibilityRole={openable ? "button" : undefined}
        accessibilityLabel={openable ? `Open ${f.name}` : f.name}
        disabled={!openable || busy}
        onPress={async () => {
          if (!path || !("id" in f)) return;
          setBusy(true);
          try {
            await openFile(path, f.name, "content_type" in f ? f.content_type : undefined);
          } catch {
            Alert.alert("Couldn't open the file", "Check your connection and try again.");
          } finally {
            setBusy(false);
          }
        }}
        style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}
      >
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: p.fill, alignItems: "center", justifyContent: "center" }}>
          {busy ? <ActivityIndicator size="small" color={p.ink2} /> : <Icon name="file" size={18} color={p.ink2} />}
        </View>
        <View style={{ flex: 1 }}>
          <T variant="calloutStrong" numberOfLines={1} tone={openable ? "accentInk" : "ink"}>
            {f.name}
          </T>
          {size ? (
            <T variant="caption" tone="ink3" style={{ fontWeight: "400" }}>
              {size}
            </T>
          ) : null}
        </View>
      </Pressable>
      {onRemove ? <IconButton icon="close" label={`Remove ${f.name}`} variant="plain" size={36} onPress={onRemove} /> : null}
    </View>
  );
}

/** A spreadsheet download (CSV that opens in Excel): fetched with the token, then shared. */
export function DownloadRow({ label, path, name, icon = "download", contentType = "text/csv" }: {
  label: string; path: string; name: string; icon?: IconName; contentType?: string;
}) {
  const p = useTheme();
  const [busy, setBusy] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy}
      onPress={async () => {
        setBusy(true);
        try {
          await openFile(path, name, contentType);
        } catch {
          Alert.alert("Couldn't download it", "Check your connection and try again.");
        } finally {
          setBusy(false);
        }
      }}
      style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 }}
    >
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: p.accentSoft, alignItems: "center", justifyContent: "center" }}>
        {busy ? <ActivityIndicator size="small" color={p.accentInk} /> : <Icon name={icon} size={18} color={p.accentInk} />}
      </View>
      <T variant="calloutStrong" tone="accentInk" style={{ flex: 1 }}>
        {label}
      </T>
    </Pressable>
  );
}
