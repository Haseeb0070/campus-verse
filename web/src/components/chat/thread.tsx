"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BellIcon, ChevronLeftIcon, PaperclipIcon, SendIcon } from "@/components/icons";
import { ApiError, apiFetch } from "@/lib/api";
import { useChat, useConversations } from "@/lib/chat";
import { courseBg, fileSize, formatDay, formatTime, tileLabel } from "@/lib/format";
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
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);
  // Only messages that arrive while the chat is open animate in; history just appears.
  const [openedAt] = useState(() => Date.now());
  const lastMarked = useRef(0);
  const notFound = chat.messages.error instanceof ApiError && chat.messages.error.status === 404;
  const router = useRouter();
  const [answering, setAnswering] = useState<"accept" | "decline" | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);

  // Private chats start as a message request (see apps/chat/services.py).
  const request = conversation?.kind === "direct" ? conversation.request_status : "accepted";
  const otherName = conversation?.other?.name ?? "They";
  const askedMe = request === "pending" && !conversation?.requested_by_me;
  const sentOpener = chat.list.some((m) => m.sender.id === me?.id && !m.failed && !m.deleted);
  const asking = request === "pending" && Boolean(conversation?.requested_by_me);
  const waitingOnThem = asking && sentOpener;

  async function answer(choice: "accept" | "decline") {
    setAnswering(choice);
    setAnswerError(null);
    try {
      await apiFetch(`/api/chat/conversations/${conversationId}/request/${choice}`, { method: "POST" });
      await queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
      if (choice === "decline") router.replace("/chat");
    } catch {
      setAnswerError("Couldn't save that. Try again.");
    } finally {
      setAnswering(null);
    }
  }

  const newest = [...chat.list].reverse().find((m) => m.id > 0);
  useEffect(() => {
    if (newest && newest.id > lastMarked.current && document.visibilityState === "visible") {
      lastMarked.current = newest.id;
      chat.markRead(newest.id);
    }
  }, [newest, chat]);

  function submit() {
    const body = draft.trim();
    if (!body && files.length === 0) return;
    setDraft("");
    setFiles([]);
    chat.send(body, undefined, files);
  }

  function pickFiles(list: FileList | null) {
    const picked = Array.from(list ?? []);
    const all = [...files, ...picked].slice(0, 4);
    setFileError(
      files.length + picked.length > 4
        ? "Attach up to 4 files at a time."
        : all.some((f) => f.size > 20 * 1024 * 1024)
          ? "Each file can be up to 20 MB."
          : null,
    );
    setFiles(all.filter((f) => f.size <= 20 * 1024 * 1024));
    if (fileInput.current) fileInput.current.value = "";
  }

  /** Flips the bell at once; puts it back if the server says no. */
  async function toggleMute() {
    if (!conversation) return;
    const muted = !conversation.muted;
    const key = ["chat", "conversations"];
    type Row = { id: number; muted: boolean };
    const flip = (to: boolean) =>
      queryClient.setQueriesData<Row[]>({ queryKey: key }, (list) =>
        Array.isArray(list) ? list.map((c) => (c.id === conversationId ? { ...c, muted: to } : c)) : list,
      );
    flip(muted);
    try {
      await apiFetch(`/api/chat/conversations/${conversationId}/mute`, {
        method: "POST",
        body: JSON.stringify({ muted }),
      });
    } catch {
      flip(!muted);
    }
  }

  if (notFound) {
    return (
      <div className="glass grid h-full place-items-center rounded-card p-6 text-center">
        <div>
          <p className="text-headline font-semibold">This chat isn&apos;t available</p>
          <p className="mt-1 text-body text-ink-2">It may belong to a subject you&apos;re not in.</p>
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
        {conversation?.other ? (
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-fill-strong text-footnote font-semibold"
            aria-hidden="true">
            {conversation.other.initials}
          </span>
        ) : (
          <span
            className={`grid size-10 shrink-0 place-items-center rounded-[12px] text-footnote font-bold text-white ${
              conversation?.color ? courseBg[conversation.color] : "bg-course-slate"
            }`}
            aria-hidden="true"
          >
            {conversation ? tileLabel(conversation.title) : ""}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-headline font-semibold">
            {conversation?.title ?? "Loading…"}
          </span>
          <span className="flex items-center gap-1.5 text-footnote text-ink-2">
            {conversation?.other ? `${conversation.other.detail} · private` : conversation?.course_title}
            {chat.live && chat.online !== null && (
              <>
                <span aria-hidden="true">·</span>
                <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                {chat.online} online
              </>
            )}
            {chat.live === false && <span className="text-ink-3"> · reconnecting…</span>}
          </span>
        </span>
        {conversation && (
          <button
            onClick={toggleMute}
            aria-pressed={conversation.muted}
            title={conversation.muted ? "Unmute notifications" : "Mute notifications"}
            className={`press relative grid size-9 shrink-0 place-items-center rounded-full hover:bg-fill ${
              conversation.muted ? "text-ink-3" : "text-ink-2"}`}
          >
            <BellIcon className="size-5" />
            {conversation.muted && (
              <span aria-hidden="true" className="absolute h-0.5 w-6 rotate-45 rounded-full bg-current" />
            )}
            <span className="sr-only">{conversation.muted ? "Unmute" : "Mute"} notifications</span>
          </button>
        )}
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
              <p className="text-headline font-semibold">
                {conversation?.other ? "Say hello" : "Start the conversation"}
              </p>
              <p className="mt-1 text-body text-ink-2">
                {conversation?.other
                  ? asking
                    ? `Your first message goes to ${otherName} as a request. You can write more once they accept.`
                    : `Only you and ${otherName} can read this chat.`
                  : "Everyone in this subject and its teachers can read it."}
              </p>
            </div>
          )}

          {chat.list.map((m, i, list) => {
            const prev = chat.list[i - 1];
            const newDay = !prev || dayLabel(prev.created_at) !== dayLabel(m.created_at);
            const grouped =
              !newDay &&
              prev?.sender.id === m.sender.id &&
              new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < GROUP_GAP_MS;
            const mine = m.sender.id === me?.id;
            const seenUpTo = conversation?.seen_up_to;
            const seen =
              mine && m.id > 0 && !m.deleted && seenUpTo != null && seenUpTo >= m.id &&
              !list.slice(i + 1).some((n) => n.sender.id === me?.id && n.id > 0 && !n.deleted);
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
                  seen={seen}
                  // Frequency: your own messages (sent many times a day) appear at once; only new
                  // messages from others arrive with a settle, so they get noticed.
                  animate={!mine && new Date(m.created_at).getTime() > openedAt}
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

      {askedMe ? (
        <div className="border-t border-divider p-4">
          <p className="text-headline font-semibold">{otherName} wants to message you</p>
          <p className="mt-0.5 text-footnote text-ink-2">
            They can&apos;t send anything else until you accept. If you decline, they won&apos;t be
            able to message you here.
          </p>
          {answerError && <p role="alert" className="mt-2 text-footnote text-danger-ink">{answerError}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => answer("accept")}
              disabled={answering !== null}
              className="press h-10 flex-1 rounded-full bg-accent px-5 text-body font-semibold text-on-accent disabled:opacity-60 sm:flex-none"
            >
              {answering === "accept" ? "Accepting…" : "Accept"}
            </button>
            <button
              type="button"
              onClick={() => answer("decline")}
              disabled={answering !== null}
              className="press h-10 flex-1 rounded-full bg-fill-strong px-5 text-body font-semibold disabled:opacity-60 sm:flex-none"
            >
              {answering === "decline" ? "Declining…" : "Decline"}
            </button>
          </div>
        </div>
      ) : waitingOnThem || request === "declined" ? (
        <p className="border-t border-divider px-4 py-4 text-footnote text-ink-2">
          {request === "declined"
            ? `${otherName} didn't accept your message request.`
            : `Request sent. You can send more once ${otherName} accepts.`}
        </p>
      ) : (
      <form
        className="border-t border-divider p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {files.length > 0 && (
          <ul aria-label="Files to send" className="mb-2 flex flex-wrap gap-2">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-1.5 rounded-full bg-fill-strong py-1 pr-1 pl-3 text-footnote">
                <span className="max-w-48 truncate font-semibold">{f.name}</span>
                <span className="text-ink-2">{fileSize(f.size)}</span>
                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  className="grid size-6 place-items-center rounded-full hover:bg-fill">
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {fileError && <p role="alert" className="mb-2 px-2 text-footnote text-danger-ink">{fileError}</p>}
        <div className="flex items-end gap-2 rounded-[24px] bg-fill p-1.5 pl-1.5 ring-accent/60 focus-within:ring-2">
          <button type="button" aria-label="Attach files" title="Attach files" onClick={() => fileInput.current?.click()}
            className="press grid size-10 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-fill-strong">
            <PaperclipIcon className="size-5" />
          </button>
          <input ref={fileInput} type="file" multiple className="sr-only" tabIndex={-1} aria-hidden="true"
            accept=".pdf,.png,.jpg,.jpeg,.docx,.pptx,.xlsx,.zip,.txt,.md,.csv,.py,.java,.c,.cpp,.h,.js,.ts,.sql,.ipynb"
            onChange={(e) => pickFiles(e.target.files)} />
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
            disabled={!draft.trim() && files.length === 0}
            className="press grid size-10 shrink-0 place-items-center rounded-full bg-accent text-on-accent disabled:opacity-40"
          >
            <SendIcon className="size-5" />
          </button>
        </div>
        <p className="mt-1.5 px-2 text-caption text-ink-3">
          {asking
            ? `Sent as a message request: ${otherName} can accept or decline it.`
            : "Enter to send · Shift+Enter for a new line"}
        </p>
      </form>
      )}
    </section>
  );
}

function MessageRow({
  message: m,
  mine,
  seen = false,
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
  /** The other person has read this, my newest message ("Seen", one-to-one chats only). */
  seen?: boolean;
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
        {(m.deleted || m.body) && (
          <div
            className={`whitespace-pre-wrap break-words rounded-[20px] px-3.5 py-2 text-body ${bubble} ${
              m.pending ? "opacity-60" : ""
            }`}
          >
            {m.deleted ? "Message removed" : m.body}
          </div>
        )}
        {!m.deleted && (m.attachments?.length ?? 0) > 0 && (
          <div className={`mt-1 flex flex-col gap-1 ${mine ? "items-end" : "items-start"} ${m.pending ? "opacity-60" : ""}`}>
            {m.attachments!.map((f) =>
              f.id > 0 && f.content_type.startsWith("image/") ? (
                <a key={f.id} href={`/api/chat/files/${f.id}`} target="_blank" rel="noopener noreferrer"
                  className="block overflow-hidden rounded-[16px] border border-divider">
                  {/* eslint-disable-next-line @next/next/no-img-element -- private, permission-checked file */}
                  <img src={`/api/chat/files/${f.id}`} alt={f.name} className="max-h-56 max-w-64 object-cover" />
                </a>
              ) : (
                <a key={f.id} href={f.id > 0 ? `/api/chat/files/${f.id}` : undefined}
                  className="press inline-flex max-w-64 items-center gap-2 rounded-full bg-fill-strong px-3 py-1.5 text-footnote font-semibold">
                  <PaperclipIcon className="size-4 shrink-0" />
                  <span className="truncate">{f.name}</span>
                  <span className="shrink-0 font-normal text-ink-2">{fileSize(f.size)}</span>
                </a>
              ),
            )}
          </div>
        )}
        <span className="mt-0.5 flex items-center gap-2 px-1 text-caption text-ink-3">
          {m.failed ? (
            <span className="text-danger-ink">
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
          {seen && <span className="font-semibold text-accent-ink">Seen</span>}
          {canDelete &&
            (confirming ? (
              <span className="flex items-center gap-1.5">
                Delete for everyone?
                <button onClick={onDelete} className="font-semibold text-danger-ink">
                  Delete
                </button>
                <button onClick={onCancelDelete} className="font-semibold">
                  Cancel
                </button>
              </span>
            ) : (
              <button
                onClick={onAskDelete}
                className="font-semibold opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
              >
                Delete
              </button>
            ))}
        </span>
      </div>
    </div>
  );
}
