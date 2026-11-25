import { router } from "expo-router";
import { View } from "react-native";
import { listTime } from "@/lib/format";
import type { Conversation } from "@/lib/types";
import { font, useTheme } from "@/theme";
import { Icon } from "./Icon";
import { Avatar, Press, T } from "./ui";

export function conversationAvatar(c: Conversation) {
  if (c.kind === "direct" && c.other) return { text: c.other.initials, color: "sky" };
  return { text: tileLabel(c.title), color: c.color ?? "slate" };
}

/** The course number for a subject's tile ("CC-310 · BSCS24" → "310"): the class code is the
 *  same on every row and too long to fit. Falls back to three letters. Same as the website's. */
export function tileLabel(text: string): string {
  const course = text.split(" · ")[0].trim();
  const number = /(\d{2,4})[A-Za-z]?\s*$/.exec(course)?.[1];
  return number ?? course.replace(/[^A-Za-z0-9+]/g, "").slice(0, 3).toUpperCase();
}

export function ConversationRow({ c, tz }: { c: Conversation; tz?: string }) {
  const p = useTheme();
  const unread = c.muted ? 0 : c.unread;
  const last = c.last_message;
  const preview = last
    ? last.deleted
      ? "Message deleted"
      : `${c.kind === "direct" ? "" : `${last.sender.name.split(" ")[0]}: `}${last.body || (last.attachments?.length ? "Sent a file" : "")}`
    : c.kind === "direct" && c.request_status === "pending"
      ? c.requested_by_me
        ? "Waiting for them to accept"
        : "Wants to message you"
      : "No messages yet";
  const avatar = conversationAvatar(c);
  const title = c.kind === "section" && c.course_title ? `${c.title}` : c.title;
  return (
    <Press
      scaleTo={0.985}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${preview}.${unread ? ` ${unread} unread.` : ""}${c.muted ? " Muted." : ""}`}
      onPress={() => router.push({ pathname: "/chat/[id]", params: { id: String(c.id) } })}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14 }}
    >
      <Avatar text={avatar.text} color={avatar.color} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
          <T variant="bodyStrong" numberOfLines={1} style={{ fontFamily: font.bold, flexShrink: 1 }}>
            {title}
          </T>
          {c.last_message_at ? (
            <T variant="caption" tone="ink3" style={{ fontWeight: "400", fontVariant: ["tabular-nums"] }}>
              {listTime(c.last_message_at, tz)}
            </T>
          ) : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <T
            variant={unread ? "calloutStrong" : "callout"}
            tone={unread ? "ink" : "ink2"}
            numberOfLines={1}
            style={{ flex: 1 }}
          >
            {preview}
          </T>
          {c.muted ? <Icon name="mute" size={14} color={p.ink3} /> : null}
          {unread ? <CountUnread n={unread} /> : null}
        </View>
      </View>
    </Press>
  );
}

export function CountUnread({ n }: { n: number }) {
  const p = useTheme();
  return (
    <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: p.accent, alignItems: "center", justifyContent: "center" }}>
      <T variant="caption" tone="onAccent" style={{ fontFamily: font.bold }}>
        {n > 99 ? "99+" : n}
      </T>
    </View>
  );
}

