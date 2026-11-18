import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import type { UploadFile } from "./api";
import { API_URL } from "./config";
import { tokenStore } from "./token";

/**
 * Opens a stored file. Every download goes through Django's permission check, so it is fetched
 * with the session token, saved to the cache, then handed to the phone's viewer or share sheet.
 */
export async function openFile(path: string, name: string, contentType?: string) {
  const token = tokenStore.current() ?? "";
  const url = `${API_URL}${path}`;

  if (Platform.OS === "web") {
    const res = await fetch(url, { headers: { "X-Session-Token": token } });
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
    return;
  }

  const folder = new Directory(Paths.cache, "downloads");
  if (!folder.exists) folder.create({ intermediates: true });
  const target = new File(folder, safeName(name));
  if (target.exists) target.delete();
  const saved = await File.downloadFileAsync(url, target, { headers: { "X-Session-Token": token } });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(saved.uri, { mimeType: contentType, dialogTitle: name });
  }
}

function safeName(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 120) || "file";
}

/** Lets someone pick files to hand in or send. Null when they cancel. */
export async function pickFiles(multiple = true): Promise<UploadFile[] | null> {
  const result = await DocumentPicker.getDocumentAsync({ multiple, copyToCacheDirectory: true });
  if (result.canceled) return null;
  return result.assets.map((a) => ({
    uri: a.uri,
    name: a.name,
    type: a.mimeType ?? "application/octet-stream",
    size: a.size,
    file: a.file,
  }));
}
