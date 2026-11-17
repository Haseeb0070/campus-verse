"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useConversations } from "@/lib/chat";
import { NewMessageButton } from "./new-message";
import { courseBg, formatTime, relativeTime } from "@/lib/format";
import type { Conversation } from "@/lib/types";
import { PageTitle } from "@/components/page-title";

function preview(c: Conversation, myId?: number) {
  const m = c.last_message;
  if (!m) return "No messages yet. Say hello.";
  if (m.deleted) return "Message removed";
  const text = m.body || (m.attachments?.length ? "Sent a file" : "");
  if (c.kind === "direct") return m.sender.id === myId ? `You: ${text}` : text;
  const who = m.sender.id === myId ? "You" : m.sender.name.split(" ")[0];
  return `${who}: ${text}`;
}

function when(iso: string | null) {
  if (!iso) return "";
  const sameDay = new Date(iso).toDateString() === new Date().toDateString();
  return sameDay ? formatTime(iso) : relativeTime(iso);
}

export function ConversationList({ myId }: { myId?: number }) {
  const conversations = useConversations();
  const params = useParams<{ id?: string }>();
  const activeId = Number(params.id);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 px-2">
        <PageTitle className="text-title-1 font-bold" text="Chat" />
        <NewMessageButton />
      </div>
      {conversations.isPending && <p className="px-2 text-body text-ink-2">Loading…</p>}
      {conversations.isError && (
        <p role="alert" className="px-2 text-body text-ink-2">
          Couldn&apos;t load your chats. Check your connection.
        </p>
      )}
      {conversations.data?.length === 0 && (
        <p className="px-2 text-body text-ink-2">
          Your section chats appear here once you&apos;re enrolled in a class.
        </p>
      )}
      <ul className="flex flex-col gap-0.5">
        {conversations.data?.map((c) => (
          <li key={c.id}>
            <ConversationRow conversation={c} myId={myId} active={c.id === activeId} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One conversation: avatar, title, last message and unread count. Also used on Today. */
export function ConversationRow({
  conversation: c,
  myId,
  active = false,
  arriving = false,
}: {
  conversation: Conversation;
  myId?: number;
  active?: boolean;
  /** A new message just came in: the row settles into place and its unread count pops. */
  arriving?: boolean;
}) {
  return (
    <Link
      href={`/chat/${c.id}`}
      aria-current={active ? "page" : undefined}
      className={`press flex items-center gap-3 rounded-row p-2.5 ${active ? "bg-fill-strong" : "hover:bg-fill"} ${
        arriving ? "arrive" : ""
      }`}
    >
      {c.other ? (
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-fill-strong text-body font-semibold"
          aria-hidden="true">
          {c.other.initials}
        </span>
      ) : (
        <span
          className={`grid size-11 shrink-0 place-items-center rounded-[14px] text-body font-bold text-white ${
            c.color ? courseBg[c.color] : "bg-course-slate"
          }`}
          aria-hidden="true"
        >
          {c.section_code ?? c.title.slice(0, 2)}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-body font-semibold">{c.title}</span>
          <span className="shrink-0 text-caption text-ink-3">{when(c.last_message_at)}</span>
        </span>
        <span className="flex items-center gap-2">
          <span
            className={`min-w-0 flex-1 truncate text-footnote ${
              c.unread ? "font-medium text-ink" : "text-ink-2"
            }`}
          >
            {preview(c, myId)}
          </span>
          {c.unread > 0 && (
            <span
              className={`grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-caption font-semibold text-on-accent ${
                arriving ? "pop" : ""
              }`}
            >
              <span className="sr-only">{c.unread} unread</span>
              <span aria-hidden="true">{c.unread > 99 ? "99+" : c.unread}</span>
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}
