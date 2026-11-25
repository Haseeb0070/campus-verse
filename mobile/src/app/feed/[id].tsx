import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PostCard, ReportSheet } from "@/components/feed";
import { StackHeader } from "@/components/StackHeader";
import { Avatar, Empty, Failed, IconButton, Pill, Skeleton, T } from "@/components/ui";
import { errorDetail } from "@/lib/api";
import { type Comment, deleteComment, moderate, useAddComment, useComments, usePost } from "@/lib/feed";
import { relativeTime } from "@/lib/format";
import { font, radius, useTheme } from "@/theme";

/** A post with its comments: replies sit under the comment they answer. */
export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = Number(id);
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const post = usePost(postId);
  const comments = useComments(postId);
  const add = useAddComment(postId);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [reporting, setReporting] = useState<number | null>(null);

  // Top-level comments in order, each followed by its replies.
  const all = comments.data ?? [];
  const ordered = all
    .filter((c) => c.parent_id === null)
    .flatMap((c) => [c, ...all.filter((r) => r.parent_id === c.id)]);

  function send() {
    const body = text.trim();
    if (!body) return;
    add.mutate(
      { body, parentId: replyTo?.id },
      {
        onSuccess: () => {
          setText("");
          setReplyTo(null);
        },
        onError: (err) => Alert.alert("Couldn't add your comment", errorDetail(err, "Try again.")),
      },
    );
  }

  async function flip(c: Comment) {
    try {
      await moderate("comment", c.id, c.visibility === "visible" ? "hide" : "restore");
      qc.invalidateQueries({ queryKey: ["feed", "comments", postId] });
    } catch (err) {
      Alert.alert("That didn't work", errorDetail(err, "Try again."));
    }
  }

  function remove(c: Comment) {
    Alert.alert("Delete this comment?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteComment(c.id);
            qc.invalidateQueries({ queryKey: ["feed", "comments", postId] });
          } catch (err) {
            Alert.alert("Couldn't delete it", errorDetail(err, "Try again."));
          }
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: p.bg }}>
      <StackHeader title="Post" subtitle={post.data ? `by ${post.data.author.name}` : undefined} />
      {post.isPending ? (
        <View style={{ padding: 16 }}>
          <Skeleton height={200} />
        </View>
      ) : !post.data ? (
        <Failed message="This post may have been deleted." onRetry={() => post.refetch()} />
      ) : (
        <FlatList
          data={ordered}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={{ gap: 14, marginBottom: 6 }}>
              <PostCard post={post.data} full />
              <T variant="calloutStrong" tone="ink2" accessibilityRole="header">
                {all.length ? `${all.length} ${all.length === 1 ? "comment" : "comments"}` : "Comments"}
              </T>
            </View>
          }
          ListEmptyComponent={
            comments.isPending ? <Skeleton height={60} /> : <Empty icon="chat" title="No comments yet" body="Start the conversation." />
          }
          renderItem={({ item }) => (
            <CommentRow
              c={item}
              onReply={() => setReplyTo(item.parent_id === null ? item : all.find((x) => x.id === item.parent_id) ?? item)}
              onDelete={() => remove(item)}
              onReport={() => setReporting(item.id)}
              onModerate={post.data?.can_moderate && !item.mine ? () => flip(item) : undefined}
            />
          )}
        />
      )}

      {post.data ? (
        <View style={{ backgroundColor: p.surface, borderTopWidth: 1, borderTopColor: p.line, paddingTop: 10, paddingHorizontal: 12, paddingBottom: Math.max(insets.bottom, 10) + 4, gap: 6 }}>
          {replyTo ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <T variant="caption" tone="ink3" style={{ flex: 1, fontWeight: "400" }} numberOfLines={1}>
                Replying to {replyTo.author.name}
              </T>
              <Pressable accessibilityRole="button" onPress={() => setReplyTo(null)} hitSlop={10}>
                <T variant="caption" tone="accentInk">
                  Cancel
                </T>
              </Pressable>
            </View>
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={replyTo ? "Write a reply" : "Write a comment"}
              placeholderTextColor={p.ink3}
              accessibilityLabel={replyTo ? "Your reply" : "Your comment"}
              multiline
              maxLength={2000}
              style={{
                flex: 1,
                minHeight: 44,
                maxHeight: 120,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: p.line,
                backgroundColor: p.bg,
                paddingHorizontal: 16,
                paddingTop: 11,
                paddingBottom: 11,
                fontFamily: font.regular,
                fontSize: 15,
                color: p.ink,
              }}
            />
            <IconButton icon="send" label="Send" variant={text.trim() ? "accent" : "fill"} onPress={send} />
          </View>
        </View>
      ) : null}

      <ReportSheet visible={reporting !== null} target="comment" id={reporting ?? 0} onClose={() => setReporting(null)} />
    </KeyboardAvoidingView>
  );
}

function CommentRow({
  c,
  onReply,
  onDelete,
  onReport,
  onModerate,
}: {
  c: Comment;
  onReply: () => void;
  onDelete: () => void;
  onReport: () => void;
  /** Moderators: hide the comment, or show it again. */
  onModerate?: () => void;
}) {
  const p = useTheme();
  const reply = c.parent_id !== null;
  return (
    <View style={{ flexDirection: "row", gap: 10, marginLeft: reply ? 36 : 0 }}>
      <Avatar text={c.author.initials} color={c.author.kind === "teacher" ? "lime" : "sky"} size={reply ? 28 : 34} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ backgroundColor: p.surface, borderWidth: 1, borderColor: p.line, borderRadius: radius.lg, paddingHorizontal: 12, paddingVertical: 8, gap: 2 }}>
          <T variant="calloutStrong" style={{ fontFamily: font.bold }}>
            {c.author.name}
          </T>
          <T variant="body" selectable>
            {c.body}
          </T>
          {c.visibility !== "visible" ? <Pill label="Hidden by a moderator" tone="warn" /> : null}
        </View>
        <View style={{ flexDirection: "row", gap: 16, paddingHorizontal: 4 }}>
          <T variant="caption" tone="ink3" style={{ fontWeight: "400" }}>
            {relativeTime(c.created_at)}
          </T>
          <Pressable accessibilityRole="button" accessibilityLabel={`Reply to ${c.author.name}`} onPress={onReply} hitSlop={10}>
            <T variant="caption" tone="ink2">
              Reply
            </T>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={c.mine ? "Delete your comment" : `Report ${c.author.name}'s comment`}
            onPress={c.mine ? onDelete : onReport}
            hitSlop={10}
          >
            <T variant="caption" tone="ink2">
              {c.mine ? "Delete" : "Report"}
            </T>
          </Pressable>
          {onModerate ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={c.visibility === "visible" ? `Hide ${c.author.name}'s comment` : `Show ${c.author.name}'s comment again`}
              onPress={onModerate}
              hitSlop={10}
            >
              <T variant="caption" tone="ink2">
                {c.visibility === "visible" ? "Hide" : "Show again"}
              </T>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}
