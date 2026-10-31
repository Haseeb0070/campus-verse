"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, SendIcon } from "@/components/icons";
import { ApiError } from "@/lib/api";
import { useChat, useConversations } from "@/lib/chat";
import { courseBg, formatDay, formatTime } from "@/lib/format";
import { useMe } from "@/lib/queries";
import type { ChatMessage } from "@/lib/types";

const GROUP_GAP_MS = 5 * 60_000;

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return formatDay(d.toISOString().slice(0, 10), { month: "short" });
}

function typingText(names: string[]) {
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return "Several people are typing…";
}

export function Thread({ conversationId }: { conversationId: number }) {
  const me = useMe().data;
  const conversation = useConversations().data?.find((c) => c.id === conversationId);
  const chat = useChat(conversationId, me);
  const [draft, setDraft] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);
  // Only messages that arrive while the chat is open animate in; history just appears.
  const [openedAt] = useState(() => Date.now());
  const lastMarked = useRef(0);
  const notFound = chat.messages.error instanceof ApiError && chat.messages.error.status === 404;

  const newest = [...chat.list].reverse().find((m) => m.id > 0);
  useEffect(() => {
    if (newest && newest.id > lastMarked.current && document.visibilityState === "visible") {
      lastMarked.current = newest.id;
      chat.markRead(newest.id);
    }
  }, [newest, chat]);

  function submit() {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    chat.send(body);
  }

  if (notFound) {
    return (
      <div className="glass grid h-full place-items-center rounded-card p-6 text-center">
        <div>
          <p className="text-headline font-semibold">This chat isn&apos;t available</p>
          <p className="mt-1 text-body text-ink-2">It may belong to a section you&apos;re not in.</p>
          <Link href="/chat" className="mt-3 inline-block text-body font-semibold text-accent-ink">
            Back to your chats
          </Link>
        </div>
      </div>
    );
  }

  const typing = chat.typists.map((t) => t.name.split(" ")[0]);

  return (
    <section
      aria-label={conversation?.title ?? "Conversation"}
      className="glass flex h-full min-h-0 flex-col overflow-hidden rounded-card"
    >
      <header className="flex items-center gap-3 border-b border-divider px-4 py-3">
        <Link
          href="/chat"
          aria-label="Back to chats"
          className="press grid size-9 place-items-center rounded-full hover:bg-fill lg:hidden"
        >
          <ChevronLeftIcon className="size-5" />
        </Link>
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-[12px] text-footnote font-bold text-white ${
            conversation?.color ? courseBg[conversation.color] : "bg-course-slate"
          }`}
          aria-hidden="true"
        >
          {conversation?.section_code ?? ""}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-headline font-semibold">
            {conversation?.title ?? "Loading…"}
          </span>
          <span className="flex items-center gap-1.5 text-footnote text-ink-2">
            {conversation?.course_title}
            {chat.live && chat.online !== null && (
              <>
                <span aria-hidden="true">·</span>
                <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                {chat.online} online
              </>
            )}
            {!chat.live && <span className="text-ink-3"> · reconnecting…</span>}
          </span>
        </span>
        {conversation?.is_moderator && (
          <span className="rounded-full bg-fill-strong px-2.5 py-1 text-caption font-semibold">
            You moderate
          </span>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto px-4 py-3" aria-live="polite">
        <div className="flex flex-col gap-1">
          {chat.messages.hasNextPage && (
            <button
              onClick={() => chat.messages.fetchNextPage()}
              disabled={chat.messages.isFetchingNextPage}
              className="press mx-auto mb-2 rounded-full bg-fill px-4 py-1.5 text-footnote font-semibold"
            >
              {chat.messages.isFetchingNextPage ? "Loading…" : "Load earlier messages"}
            </button>
          )}
          {chat.messages.isPending && <p className="py-6 text-center text-body text-ink-2">Loading messages…</p>}
          {chat.messages.isSuccess && chat.list.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-headline font-semibold">Start the conversation</p>
              <p className="mt-1 text-body text-ink-2">
                Everyone in this section and its teachers can read it.
              </p>
            </div>
          )}

          {chat.list.map((m, i) => {
            const prev = chat.list[i - 1];
            const newDay = !prev || dayLabel(prev.created_at) !== dayLabel(m.created_at);
            const grouped =
              !newDay &&
              prev?.sender.id === m.sender.id &&
              new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < GROUP_GAP_MS;
            const mine = m.sender.id === me?.id;
            const canDelete = !m.deleted && m.id > 0 && (mine || conversation?.is_moderator);

            return (
              <div key={m.client_id} className={grouped ? "" : "mt-2"}>
                {newDay && (
                  <p className="my-3 text-center">
                    <span className="rounded-full bg-fill px-3 py-1 text-caption font-semibold text-ink-2">
                      {dayLabel(m.created_at)}
                    </span>
                  </p>
                )}
                <MessageRow
                  message={m}
                  mine={mine}
                  animate={m.pending || new Date(m.created_at).getTime() > openedAt}
                  showSender={!grouped && !mine}
                  canDelete={Boolean(canDelete)}
                  confirming={confirmingDelete === m.id}
                  onAskDelete={() => setConfirmingDelete(m.id)}
                  onCancelDelete={() => setConfirmingDelete(null)}
                  onDelete={async () => {
                    setConfirmingDelete(null);
                    await chat.remove(m);
                  }}
                  onRetry={() => chat.send(m.body, m)}
                />
              </div>
            );
          })}

          <p className="h-5 pt-1 text-footnote text-ink-2" aria-live="polite">
            {typing.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex gap-0.5" aria-hidden="true">
                  <span className="pulse-dot size-1.5 rounded-full bg-ink-3" />
                  <span className="pulse-dot size-1.5 rounded-full bg-ink-3 [animation-delay:150ms]" />
                  <span className="pulse-dot size-1.5 rounded-full bg-ink-3 [animation-delay:300ms]" />
                </span>
                {typingText(typing)}
              </span>
            )}
          </p>
        </div>
      </div>

      <form
        className="border-t border-divider p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex items-end gap-2 rounded-[24px] bg-fill p-1.5 pl-4 ring-accent/60 focus-within:ring-2">
          <label htmlFor="composer" className="sr-only">
            Message {conversation?.title}
          </label>
          <textarea
            id="composer"
            rows={1}
            value={draft}
            maxLength={4000}
            placeholder={`Message ${conversation?.title ?? ""}`}
            onChange={(e) => {
              setDraft(e.target.value);
              if (e.target.value) chat.notifyTyping();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            className="max-h-40 min-h-9 flex-1 resize-none bg-transparent py-2 text-body outline-none focus-visible:outline-none [field-sizing:content]"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={!draft.trim()}
            className="press grid size-10 shrink-0 place-items-center rounded-full bg-accent text-on-accent disabled:opacity-40"
          >
            <SendIcon className="size-5" />
          </button>
        </div>
        <p className="mt-1.5 px-2 text-caption text-ink-3">Enter to send · Shift+Enter for a new line</p>
      </form>
    </section>
  );
}

function MessageRow({
  message: m,
  mine,
  animate,
  showSender,
  canDelete,
  confirming,
  onAskDelete,
  onCancelDelete,
  onDelete,
  onRetry,
}: {
  message: ChatMessage;
  mine: boolean;
  animate: boolean;
  showSender: boolean;
  canDelete: boolean;
  confirming: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
  onRetry: () => void;
}) {
  const bubble = m.deleted
    ? "bg-fill text-ink-3 italic"
    : mine
      ? "bg-accent text-on-accent"
      : "bg-[var(--cv-surface)] border border-divider";

  return (
    <div
      className={`group flex items-end gap-2 ${mine ? "flex-row-reverse" : ""} ${animate ? "arrive" : ""}`}
    >
      {!mine && (
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-full text-caption font-semibold ${
            showSender ? "bg-fill-strong" : "invisible"
          }`}
          aria-hidden="true"
        >
          {m.sender.initials}
        </span>
      )}
      <div className={`flex max-w-[78%] flex-col ${mine ? "items-end" : "items-start"}`}>
        {showSender && (
          <span className="mb-0.5 flex items-center gap-1.5 px-1 text-caption font-semibold text-ink-2">
            {m.sender.name}
            {m.sender.is_teacher && (
              <span className="rounded-md bg-accent/12 px-1.5 py-px text-accent-ink">Teacher</span>
            )}
          </span>
        )}
        <div
          className={`whitespace-pre-wrap break-words rounded-[20px] px-3.5 py-2 text-body ${bubble} ${
            m.pending ? "opacity-60" : ""
          }`}
        >
          {m.deleted ? "Message removed" : m.body}
        </div>
        <span className="mt-0.5 flex items-center gap-2 px-1 text-caption text-ink-3">
          {m.failed ? (
            <span className="text-danger">
              Not sent ·{" "}
              <button onClick={onRetry} className="font-semibold underline">
                Retry
              </button>
            </span>
          ) : m.pending ? (
            "Sending…"
          ) : (
            <time dateTime={m.created_at}>{formatTime(m.created_at)}</time>
          )}
          {canDelete &&
            (confirming ? (
              <span className="flex items-center gap-1.5">
                Delete for everyone?
                <button onClick={onDelete} className="font-semibold text-danger">
                  Delete
                </button>
                <button onClick={onCancelDelete} className="font-semibold">
                  Cancel
                </button>
              </span>
            ) : (
              <button
                onClick={onAskDelete}
                className="font-semibold opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
              >
                Delete
              </button>
            ))}
        </span>
      </div>
    </div>
  );
}
