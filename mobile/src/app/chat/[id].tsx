import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { changeOf, isOff, place } from "@/components/classes";
import { conversationAvatar } from "@/components/conversations";
import { Icon } from "@/components/Icon";
import { StackHeader } from "@/components/StackHeader";
import { ChatVerse, PEEK } from "@/components/verse/ChatVerse";
import { Avatar, Button, Failed, IconButton, Press, Skeleton, T } from "@/components/ui";
import { apiFetch, errorDetail, type UploadFile } from "@/lib/api";
import { useChat, useConversation } from "@/lib/chat";
import { useNow } from "@/lib/now";
import { openFile, pickFiles } from "@/lib/files";
import { fileSize, formatDay, formatTime, todayIn } from "@/lib/format";
import { useMe, useTimetable } from "@/lib/queries";
import type { ChatMessage, Conversation, StoredFileInfo } from "@/lib/types";
import { font, radius, useTheme } from "@/theme";

export default function Thread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = Number(id);
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const me = useMe().data;
  const tz = me?.institution?.timezone;
  const conv = useConversation(conversationId);
  const chat = useChat(conversationId, me);
  const qc = useQueryClient();

  const c = conv.data;
  const avatar = c ? conversationAvatar(c) : null;
  const subtitle = c
    ? c.kind === "direct"
      ? c.other?.detail || (c.other?.kind === "teacher" ? "Teacher" : "")
      : [c.course_title, chat.typists.length ? null : chat.online ? `${chat.online} online` : null].filter(Boolean).join(" · ")
    : undefined;

  // Newest message from someone else, to mark as read.
  const newest = chat.list.length ? chat.list[chat.list.length - 1] : null;
  useEffect(() => {
    if (newest && newest.id > 0 && newest.sender.id !== me?.id) chat.markRead(newest.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newest?.id]);

  async function toggleMute() {
    if (!c) return;
    await apiFetch(`/api/chat/conversations/${c.id}/mute`, { method: "POST", body: JSON.stringify({ muted: !c.muted }) }).catch(() => {});
    qc.invalidateQueries({ queryKey: ["chat"] });
  }

  async function answer(accept: boolean) {
    if (!c) return;
    try {
      await apiFetch(`/api/chat/conversations/${c.id}/request/${accept ? "accept" : "decline"}`, { method: "POST" });
      qc.invalidateQueries({ queryKey: ["chat"] });
      if (!accept) router.back();
    } catch (err) {
      Alert.alert("Couldn't answer", errorDetail(err, "Try again."));
    }
  }

  // Verse, peeking over the composer (components/verse/ChatVerse).
  const verseOn = p.guide.inApp;
  const [draft, setDraft] = useState({ text: "", focused: false });
  const [sent, setSent] = useState(0);
  const [received, setReceived] = useState(0);
  const [away, setAway] = useState(false);
  const [barWidth, setBarWidth] = useState(0);
  const seenNewest = useRef<number | null>(null);
  useEffect(() => {
    if (!newest || newest.id <= 0) return;
    // Not on opening the chat: only messages that arrive while it is open.
    if (seenNewest.current !== null && newest.id > seenNewest.current && newest.sender.id !== me?.id) setReceived((n) => n + 1);
    seenNewest.current = Math.max(seenNewest.current ?? 0, newest.id);
  }, [newest, me?.id]);

  const waitingOnMe = c?.kind === "direct" && c.request_status === "pending" && !c.requested_by_me;
  const declined = c?.request_status === "declined";

  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={{ flex: 1, backgroundColor: p.bg }}
    >
      <StackHeader
        title={c?.title ?? "Chat"}
        subtitle={chat.typists.length ? typingText(chat.typists.map((t) => t.name)) : subtitle}
        leading={avatar ? <Avatar text={avatar.text} color={avatar.color} size={40} /> : null}
        actions={
          c ? (
            <IconButton
              icon={c.muted ? "bell" : "mute"}
              label={c.muted ? "Unmute this chat" : "Mute this chat"}
              variant="plain"
              onPress={toggleMute}
            />
          ) : null
        }
      />

      {c?.kind === "section" && c.section_id ? <NextClassBanner sectionId={c.section_id} tz={tz} /> : null}

      {chat.messages.isPending ? (
        <View style={{ flex: 1, padding: 16, gap: 14, justifyContent: "flex-end" }}>
          <Skeleton height={56} style={{ width: "70%" }} />
          <Skeleton height={44} style={{ width: "55%", alignSelf: "flex-end" }} />
          <Skeleton height={56} style={{ width: "65%" }} />
        </View>
      ) : chat.messages.isError && !chat.messages.data ? (
        <View style={{ flex: 1, justifyContent: "center" }}>
          <Failed onRetry={() => chat.messages.refetch()} />
        </View>
      ) : (
        <Messages
          list={chat.list}
          meId={me?.id}
          tz={tz}
          conv={c}
          onRetry={(m) => chat.send(m.body, m)}
          onDelete={chat.remove}
          onLoadOlder={() => chat.messages.hasNextPage && !chat.messages.isFetchingNextPage && chat.messages.fetchNextPage()}
          loadingOlder={chat.messages.isFetchingNextPage}
          reserve={verseOn ? PEEK : 0}
          onAway={setAway}
        />
      )}

      {waitingOnMe ? (
        <View style={[styles.bar, { backgroundColor: p.surface, borderTopColor: p.line, paddingBottom: insets.bottom + 12, gap: 10 }]}>
          <T variant="callout" tone="ink2" style={{ textAlign: "center" }}>
            {c?.other?.name ?? "Someone"} wants to message you. They won’t know you’ve seen this until you answer.
          </T>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button label="Decline" variant="secondary" style={{ flex: 1 }} onPress={() => answer(false)} />
            <Button label="Accept" style={{ flex: 1 }} onPress={() => answer(true)} />
          </View>
        </View>
      ) : declined ? (
        <View style={[styles.bar, { backgroundColor: p.surface, borderTopColor: p.line, paddingBottom: insets.bottom + 12 }]}>
          <T variant="callout" tone="ink3" style={{ textAlign: "center" }}>
            This chat request was declined.
          </T>
        </View>
      ) : (
        <View onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}>
          {verseOn && barWidth ? (
            <ChatVerse
              width={barWidth}
              focused={draft.focused}
              text={draft.text}
              sent={sent}
              received={received}
              othersTyping={chat.typists.length > 0}
              away={away}
            />
          ) : null}
        <Composer
          placeholder={c ? `Message ${c.title}` : "Message"}
          note={c?.kind === "direct" && c.request_status === "pending" ? "They'll see your messages once they accept." : null}
          onTyping={chat.notifyTyping}
          onSend={(body, files) => {
            chat.send(body, undefined, files);
            setSent((n) => n + 1);
          }}
          onDraft={setDraft}
        />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function typingText(names: string[]) {
  const first = names.map((n) => n.split(" ")[0]);
  if (first.length === 1) return `${first[0]} is typing…`;
  if (first.length === 2) return `${first[0]} and ${first[1]} are typing…`;
  return "Several people are typing…";
}

function NextClassBanner({ sectionId, tz }: { sectionId: number; tz?: string }) {
  const p = useTheme();
  const today = todayIn(tz);
  const week = useTimetable(today, 7);
  const now = useNow();
  const next = week.data?.find((o) => o.section_id === sectionId && new Date(o.ends_at).getTime() > now && !isOff(o));
  if (!next) return null;
  const change = changeOf(next, tz);
  const when = next.date === today ? formatTime(next.starts_at, tz) : `${formatDay(next.date, { day: undefined, month: undefined })} ${formatTime(next.starts_at, tz)}`;
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={`Next class ${when}, ${place(next)}${change ? `. ${change.label}` : ""}. Opens the timetable.`}
      onPress={() => router.navigate("/timetable")}
      style={{ flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginTop: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.md, backgroundColor: p.field }}
    >
      <Icon name="clock" size={16} color={p.onField} />
      <T variant="callout" tone="onField" style={{ flex: 1 }} numberOfLines={1}>
        <T variant="calloutStrong" tone="onField" style={{ fontFamily: font.bold }}>
          Next class {when}
        </T>
        {` · ${place(next)}`}
        {change ? ` · ${change.label}` : ""}
      </T>
    </Press>
  );
}

type Row = { type: "message"; m: ChatMessage; first: boolean; last: boolean } | { type: "day"; key: string; label: string };

function Messages({
  list,
  meId,
  tz,
  conv,
  onRetry,
  onDelete,
  onLoadOlder,
  loadingOlder,
  reserve,
  onAway,
}: {
  list: ChatMessage[];
  meId?: number;
  tz?: string;
  conv?: Conversation;
  onRetry: (m: ChatMessage) => void;
  onDelete: (m: ChatMessage) => Promise<void>;
  onLoadOlder: () => void;
  loadingOlder: boolean;
  /** Room kept under the newest message for Verse, so it never sits over one. */
  reserve: number;
  /** Whether the list is scrolled up away from the newest messages. */
  onAway: (away: boolean) => void;
}) {
  const away = useRef(false);
  // Newest first, for an inverted list that starts at the bottom and keeps its place.
  const rows = useMemo(() => {
    const out: Row[] = [];
    const today = todayIn(tz);
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      const newer = list[i + 1];
      const older = list[i - 1];
      const day = todayIn(tz, new Date(m.created_at));
      const sameAsOlder = older && older.sender.id === m.sender.id && todayIn(tz, new Date(older.created_at)) === day;
      const sameAsNewer = newer && newer.sender.id === m.sender.id && todayIn(tz, new Date(newer.created_at)) === day;
      out.push({ type: "message", m, first: !sameAsOlder, last: !sameAsNewer });
      if (!older || todayIn(tz, new Date(older.created_at)) !== day) {
        out.push({ type: "day", key: `day-${day}`, label: day === today ? "Today" : formatDay(day, { month: "short" }) });
      }
    }
    return out;
  }, [list, tz]);

  if (!list.length) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <T variant="headline" style={{ textAlign: "center" }}>
          No messages yet
        </T>
        <T variant="callout" tone="ink3" style={{ textAlign: "center", marginTop: 6 }}>
          {conv?.kind === "section" ? "Say hello to your classmates." : "Start the conversation."}
        </T>
      </View>
    );
  }

  return (
    <FlatList
      inverted
      data={rows}
      keyExtractor={(r) => (r.type === "day" ? r.key : r.m.client_id || String(r.m.id))}
      // Inverted: the top padding is the room at the bottom, under the newest message.
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, paddingTop: 12 + reserve }}
      onScroll={(e) => {
        const now = e.nativeEvent.contentOffset.y > 24;
        if (now !== away.current) {
          away.current = now;
          onAway(now);
        }
      }}
      scrollEventThrottle={64}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      onEndReached={onLoadOlder}
      onEndReachedThreshold={0.4}
      ListFooterComponent={loadingOlder ? <ActivityIndicator style={{ margin: 12 }} /> : undefined}
      renderItem={({ item }) =>
        item.type === "day" ? (
          <DayLabel label={item.label} />
        ) : (
          <Bubble
            m={item.m}
            mine={item.m.sender.id === meId}
            first={item.first}
            last={item.last}
            tz={tz}
            canModerate={!!conv?.is_moderator}
            onRetry={onRetry}
            onDelete={onDelete}
          />
        )
      }
    />
  );
}

function DayLabel({ label }: { label: string }) {
  return (
    <View style={{ alignItems: "center", marginVertical: 12 }}>
      <T variant="caption" tone="ink3">
        {label}
      </T>
    </View>
  );
}

function Bubble({
  m,
  mine,
  first,
  last,
  tz,
  canModerate,
  onRetry,
  onDelete,
}: {
  m: ChatMessage;
  mine: boolean;
  first: boolean;
  last: boolean;
  tz?: string;
  canModerate: boolean;
  onRetry: (m: ChatMessage) => void;
  onDelete: (m: ChatMessage) => Promise<void>;
}) {
  const p = useTheme();
  const time = formatTime(m.created_at, tz);
  const canDelete = !m.deleted && m.id > 0 && (mine || canModerate);

  function longPress() {
    if (!canDelete) return;
    const go = () => onDelete(m).catch((err) => Alert.alert("Couldn't delete", errorDetail(err, "Try again.")));
    if (Platform.OS === "web") {
      if (globalThis.confirm?.("Delete this message for everyone?")) go();
      return;
    }
    Alert.alert("Delete this message?", "It's removed for everyone in the chat.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: go },
    ]);
  }

  const shape = mine
    ? { borderTopLeftRadius: 18, borderBottomLeftRadius: 18, borderTopRightRadius: first ? 18 : 6, borderBottomRightRadius: 6 }
    : { borderTopRightRadius: 18, borderBottomRightRadius: 18, borderTopLeftRadius: first ? 18 : 6, borderBottomLeftRadius: 6 };

  const body = m.deleted ? (
    <T variant="body" tone="ink3" style={{ fontStyle: "italic" }}>
      Message deleted
    </T>
  ) : (
    <>
      {m.body ? (
        <T variant="body" tone={mine ? "onAccent" : "ink"} selectable>
          {m.body}
        </T>
      ) : null}
      {m.attachments?.map((f) => <Attachment key={f.id} f={f} mine={mine} />)}
    </>
  );

  const label = `${mine ? "You" : m.sender.name}${m.sender.is_teacher ? ", teacher" : ""}, ${time}: ${m.deleted ? "message deleted" : m.body}${
    m.attachments?.length ? `, ${m.attachments.length} file${m.attachments.length > 1 ? "s" : ""}` : ""
  }${m.pending ? ", sending" : m.failed ? ", not sent" : ""}`;

  if (mine) {
    return (
      <Animated.View entering={m.pending ? FadeInDown.springify().damping(20) : undefined} style={{ alignItems: "flex-end", marginTop: first ? 10 : 3 }}>
        <Pressable
          accessibilityLabel={label}
          accessibilityHint={m.failed ? "Tap to send again" : canDelete ? "Long press to delete" : undefined}
          onLongPress={longPress}
          onPress={m.failed ? () => onRetry(m) : undefined}
          style={[
            { maxWidth: "80%", paddingHorizontal: 14, paddingVertical: 10, gap: 6, opacity: m.pending ? 0.75 : 1 },
            shape,
            { backgroundColor: m.deleted ? p.fill : m.failed ? p.danger : p.accent },
          ]}
        >
          {body}
        </Pressable>
        {last || m.failed || m.pending ? (
          <T variant="caption" tone={m.failed ? "danger" : "ink3"} style={{ marginTop: 4, fontWeight: "400" }}>
            {m.failed ? "Not sent · tap to try again" : m.pending ? "Sending…" : time}
          </T>
        ) : null}
      </Animated.View>
    );
  }

  return (
    <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end", marginTop: first ? 12 : 3 }}>
      <View style={{ width: 32 }}>{last ? <Avatar text={m.sender.initials} color={m.sender.is_teacher ? "lime" : "slate"} size={32} /> : null}</View>
      <View style={{ maxWidth: "80%", gap: 3 }}>
        {first ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <T variant="caption" tone="ink2" style={{ fontFamily: font.bold }}>
              {m.sender.name}
            </T>
            {m.sender.is_teacher ? (
              <View style={{ backgroundColor: p.accentSoft, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
                <T variant="caption" tone="accentInk" style={{ fontSize: 11, fontFamily: font.bold }}>
                  Teacher
                </T>
              </View>
            ) : null}
            <T variant="caption" tone="ink3" style={{ fontWeight: "400" }}>
              {time}
            </T>
          </View>
        ) : null}
        <Pressable
          accessibilityLabel={label}
          accessibilityHint={canDelete ? "Long press to delete" : undefined}
          onLongPress={longPress}
          style={[
            { paddingHorizontal: 14, paddingVertical: 10, gap: 6, backgroundColor: p.surface, borderWidth: 1, borderColor: p.line },
            shape,
          ]}
        >
          {body}
        </Pressable>
      </View>
    </View>
  );
}

function Attachment({ f, mine }: { f: StoredFileInfo; mine: boolean }) {
  const p = useTheme();
  const [busy, setBusy] = useState(false);
  const sending = f.id < 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${f.name}, ${fileSize(f.size)}`}
      disabled={sending || busy}
      onPress={async () => {
        setBusy(true);
        try {
          await openFile(`/api/chat/files/${f.id}`, f.name, f.content_type);
        } catch {
          Alert.alert("Couldn't open the file", "Check your connection and try again.");
        } finally {
          setBusy(false);
        }
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        padding: 10,
        borderRadius: 12,
        backgroundColor: mine ? "rgba(255,255,255,0.16)" : p.fill,
      }}
    >
      {busy ? <ActivityIndicator size="small" color={mine ? p.onAccent : p.ink2} /> : <Icon name="file" size={18} color={mine ? p.onAccent : p.ink2} />}
      <View style={{ flexShrink: 1 }}>
        <T variant="calloutStrong" tone={mine ? "onAccent" : "ink"} numberOfLines={1}>
          {f.name}
        </T>
        <T variant="caption" tone={mine ? "onAccent" : "ink3"} style={{ fontWeight: "400", opacity: mine ? 0.8 : 1 }}>
          {sending ? "Uploading…" : fileSize(f.size)}
        </T>
      </View>
    </Pressable>
  );
}

function Composer({
  placeholder,
  note,
  onSend,
  onTyping,
  onDraft,
}: {
  placeholder: string;
  note: string | null;
  onSend: (body: string, files: UploadFile[]) => void;
  onTyping: () => void;
  /** What is in the field and whether it has focus, for Verse to read along. */
  onDraft: (draft: { text: string; focused: boolean }) => void;
}) {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [focused, setFocused] = useState(false);
  const canSend = text.trim().length > 0 || files.length > 0;
  useEffect(() => onDraft({ text, focused }), [text, focused, onDraft]);

  function send() {
    if (!canSend) return;
    onSend(text.trim(), files);
    setText("");
    setFiles([]);
  }

  async function attach() {
    const picked = await pickFiles(true);
    if (picked) setFiles((list) => [...list, ...picked].slice(0, 5));
  }

  return (
    <View style={[styles.bar, { backgroundColor: p.surface, borderTopColor: p.line, paddingBottom: Math.max(insets.bottom, 10) + 4 }]}>
      {note ? (
        <T variant="caption" tone="ink3" style={{ textAlign: "center", fontWeight: "400", marginBottom: 8 }}>
          {note}
        </T>
      ) : null}
      {files.length ? (
        <Animated.View entering={FadeIn} style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {files.map((f, i) => (
            <View key={`${f.uri}-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: p.fill, borderRadius: radius.pill, paddingLeft: 12, paddingRight: 4, paddingVertical: 4 }}>
              <T variant="caption" tone="ink2" numberOfLines={1} style={{ maxWidth: 160 }}>
                {f.name}
              </T>
              <IconButton icon="close" label={`Remove ${f.name}`} variant="plain" size={28} onPress={() => setFiles((l) => l.filter((_, j) => j !== i))} />
            </View>
          ))}
        </Animated.View>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
        <IconButton icon="attach" label="Attach a file" variant="fill" onPress={attach} />
        <TextInput
          value={text}
          onChangeText={(v) => {
            setText(v);
            if (v) onTyping();
          }}
          placeholder={placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholderTextColor={p.ink3}
          accessibilityLabel={placeholder}
          multiline
          maxLength={4000}
          style={{
            flex: 1,
            minHeight: 44,
            maxHeight: 130,
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
        <IconButton icon="send" label="Send" variant={canSend ? "accent" : "fill"} onPress={send} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingTop: 10, paddingHorizontal: 12, borderTopWidth: StyleSheet.hairlineWidth * 2 },
});
