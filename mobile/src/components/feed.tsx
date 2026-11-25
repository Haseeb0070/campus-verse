import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errorDetail } from "@/lib/api";
import { API_URL } from "@/lib/config";
import {
  deletePost,
  feedFilePath,
  feedKey,
  moderate,
  type Post,
  report,
  REPORT_REASONS,
  type ReportReason,
  useToggleLike,
} from "@/lib/feed";
import { openFile } from "@/lib/files";
import { fileSize, relativeTime } from "@/lib/format";
import { tokenStore } from "@/lib/token";
import type { StoredFileInfo } from "@/lib/types";
import { font, radius, useTheme } from "@/theme";
import { Icon } from "./Icon";
import { Avatar, Button, Card, Chip, IconButton, Pill, Press, T } from "./ui";

/** A photo from a post, fetched with the session token (the files are private). */
function Photo({ f, onOpen }: { f: StoredFileInfo; onOpen: () => void }) {
  const p = useTheme();
  return (
    <Pressable accessibilityRole="imagebutton" accessibilityLabel={`Photo: ${f.name}. Opens it.`} onPress={onOpen}>
      <Image
        source={{ uri: `${API_URL}${feedFilePath(f.id)}`, headers: { "X-Session-Token": tokenStore.current() ?? "" } }}
        style={{ width: "100%", aspectRatio: 4 / 3, borderRadius: radius.md, backgroundColor: p.fill }}
        contentFit="cover"
        transition={150}
        cachePolicy="memory-disk"
      />
    </Pressable>
  );
}

function FileChip({ f, onOpen }: { f: StoredFileInfo; onOpen: () => void }) {
  const p = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${f.name}, ${fileSize(f.size)}`}
      onPress={onOpen}
      style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: radius.md, backgroundColor: p.fill }}
    >
      <Icon name="file" size={18} color={p.ink2} />
      <View style={{ flex: 1 }}>
        <T variant="calloutStrong" numberOfLines={1}>
          {f.name}
        </T>
        <T variant="caption" tone="ink3" style={{ fontWeight: "400" }}>
          {fileSize(f.size)}
        </T>
      </View>
    </Pressable>
  );
}

export function PostCard({ post, full = false }: { post: Post; full?: boolean }) {
  const p = useTheme();
  const qc = useQueryClient();
  const toggleLike = useToggleLike();
  const [reporting, setReporting] = useState(false);
  const hidden = post.visibility !== "visible";
  // Photos inline on phones; the web preview can't send the token with an <img>, so it lists them.
  const photos = Platform.OS !== "web" ? post.attachments.filter((f) => f.content_type.startsWith("image/")) : [];
  const files = post.attachments.filter((f) => !photos.includes(f));

  const open = (f: StoredFileInfo) =>
    openFile(feedFilePath(f.id), f.name, f.content_type).catch(() =>
      Alert.alert("Couldn't open the file", "Check your connection and try again."),
    );

  function menu() {
    const remove = async () => {
      try {
        await deletePost(post.id);
        qc.invalidateQueries({ queryKey: feedKey });
        if (full) router.back();
      } catch (err) {
        Alert.alert("Couldn't delete it", errorDetail(err, "Try again."));
      }
    };
    if (post.can_moderate && !post.mine) {
      const hiding = post.visibility === "visible";
      const flip = async () => {
        try {
          await moderate("post", post.id, hiding ? "hide" : "restore");
          qc.invalidateQueries({ queryKey: feedKey });
        } catch (err) {
          Alert.alert("That didn't work", errorDetail(err, "Try again."));
        }
      };
      Alert.alert(hiding ? "Hide this post?" : "Show this post again?", hiding ? "Students stop seeing it. Its author and moderators still can." : undefined, [
        { text: "Cancel", style: "cancel" },
        { text: "Report it instead", onPress: () => setReporting(true) },
        { text: hiding ? "Hide" : "Show again", style: hiding ? "destructive" : "default", onPress: flip },
      ]);
      return;
    }
    if (post.mine) {
      Alert.alert("Delete this post?", "It's removed for everyone, with its comments.", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: remove },
      ]);
    } else {
      setReporting(true);
    }
  }

  const openPost = () => router.push({ pathname: "/feed/[id]", params: { id: String(post.id) } });

  return (
    <Card style={{ gap: 12, opacity: hidden ? 0.7 : 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Avatar text={post.author.initials} color={post.author.kind === "teacher" ? "lime" : "sky"} size={40} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <T variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1, fontFamily: font.bold }}>
              {post.author.name}
            </T>
            {post.author.kind !== "student" ? (
              <View style={{ backgroundColor: p.accentSoft, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
                <T variant="caption" tone="accentInk" style={{ fontSize: 11, fontFamily: font.bold }}>
                  {post.author.kind === "teacher" ? "Teacher" : "Staff"}
                </T>
              </View>
            ) : null}
          </View>
          <T variant="caption" tone="ink3" numberOfLines={1} style={{ fontWeight: "400" }}>
            {relativeTime(post.created_at)}
            {post.audiences.length ? ` · ${post.audiences.join(", ")}` : ""}
          </T>
        </View>
        <IconButton
          icon={post.mine ? "trash" : "flag"}
          label={post.mine ? "Delete this post" : post.can_moderate ? "Moderate this post" : "Report this post"} variant="plain" size={40} onPress={menu} />
      </View>

      {hidden ? <Pill label="Hidden by a moderator" tone="warn" /> : null}

      {post.body ? (
        <Pressable disabled={full} onPress={openPost} accessibilityRole={full ? undefined : "button"}>
          <T variant="body" selectable={full} numberOfLines={full ? undefined : 8}>
            {post.body}
          </T>
        </Pressable>
      ) : null}

      {photos.map((f) => (
        <Photo key={f.id} f={f} onOpen={() => open(f)} />
      ))}
      {files.map((f) => (
        <FileChip key={f.id} f={f} onOpen={() => open(f)} />
      ))}

      <View style={{ flexDirection: "row", gap: 8 }}>
        <Press
          accessibilityRole="button"
          accessibilityLabel={`${post.reacted ? "Unlike" : "Like"}. ${post.reaction_count} ${post.reaction_count === 1 ? "like" : "likes"}`}
          accessibilityState={{ selected: post.reacted }}
          haptic
          onPress={() => toggleLike(post).catch(() => {})}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            minHeight: 40,
            paddingHorizontal: 14,
            borderRadius: radius.pill,
            backgroundColor: post.reacted ? p.accentSoft : p.fill,
          }}
        >
          <Icon name="heart" size={18} color={post.reacted ? p.accent : p.ink2} fill={post.reacted ? p.accent : "none"} />
          <T variant="calloutStrong" tone={post.reacted ? "accentInk" : "ink2"}>
            {post.reaction_count || "Like"}
          </T>
        </Press>
        <Press
          accessibilityRole="button"
          accessibilityLabel={`${post.comment_count} ${post.comment_count === 1 ? "comment" : "comments"}. Opens them.`}
          disabled={full}
          onPress={openPost}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: p.fill }}
        >
          <Icon name="chat" size={18} color={p.ink2} />
          <T variant="calloutStrong" tone="ink2">
            {post.comment_count || "Comment"}
          </T>
        </Press>
      </View>

      <ReportSheet visible={reporting} target="post" id={post.id} onClose={() => setReporting(false)} />
    </Card>
  );
}

/** Report a post or comment to the moderators: a reason, and a few words if they help. */
export function ReportSheet({
  visible,
  target,
  id,
  onClose,
}: {
  visible: boolean;
  target: "post" | "comment";
  id: number;
  onClose: () => void;
}) {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  function close() {
    setReason(null);
    setDetails("");
    setState("idle");
    setError(null);
    onClose();
  }

  async function send() {
    if (!reason) return setError("Choose a reason.");
    setState("sending");
    setError(null);
    try {
      await report(target, id, reason, details.trim());
      setState("sent");
    } catch (err) {
      setError(errorDetail(err, "Couldn't send the report. Try again."));
      setState("idle");
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable accessibilityLabel="Close" onPress={close} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }} />
      <View
        style={{
          backgroundColor: p.surface,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          padding: 20,
          paddingBottom: insets.bottom + 20,
          gap: 14,
        }}
      >
        {state === "sent" ? (
          <>
            <T variant="headline">Thanks for telling us</T>
            <T variant="body" tone="ink2">
              A moderator will look at it. The person who posted it isn&rsquo;t told who reported it.
            </T>
            <Button label="Done" onPress={close} />
          </>
        ) : (
          <>
            <T variant="headline">Report this {target}</T>
            <ScrollView horizontal={false} contentContainerStyle={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {REPORT_REASONS.map((r) => (
                <Chip key={r.key} label={r.label} on={reason === r.key} onPress={() => setReason(r.key)} />
              ))}
            </ScrollView>
            <TextInput
              value={details}
              onChangeText={setDetails}
              placeholder="Anything the moderators should know (optional)"
              placeholderTextColor={p.ink3}
              accessibilityLabel="Details for the moderators"
              multiline
              maxLength={500}
              style={{
                minHeight: 80,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: p.line,
                backgroundColor: p.bg,
                padding: 12,
                fontFamily: font.regular,
                fontSize: 15,
                color: p.ink,
                textAlignVertical: "top",
              }}
            />
            {error ? (
              <T variant="callout" tone="danger">
                {error}
              </T>
            ) : null}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button label="Cancel" variant="secondary" style={{ flex: 1 }} onPress={close} />
              <Button label="Send report" style={{ flex: 1 }} busy={state === "sending"} onPress={send} />
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}
