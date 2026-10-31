"use client";

import {
  type InfiniteData,
  type QueryClient,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { PublicationContext, Subscription } from "centrifuge";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "./api";
import { getRealtime, useRealtimeConnected } from "./realtime";
import type { ChatMessage, Conversation, Me, MessagePage } from "./types";

type Pages = InfiniteData<MessagePage, number | undefined>;

const conversationsKey = ["chat", "conversations"] as const;
const messagesKey = (id: number) => ["chat", "messages", id] as const;

export function useConversations() {
  return useQuery({
    queryKey: conversationsKey,
    queryFn: () => apiFetch<Conversation[]>("/api/chat/conversations"),
    refetchInterval: 20_000,
  });
}

export function useUnreadTotal() {
  const { data } = useConversations();
  return data?.reduce((sum, c) => sum + c.unread, 0) ?? 0;
}

/** Insert or replace a message (matched by id or by the sender's client_id). */
function upsert(qc: QueryClient, conversationId: number, message: ChatMessage) {
  qc.setQueryData<Pages>(messagesKey(conversationId), (data) => {
    if (!data) return data;
    let found = false;
    const pages = data.pages.map((page) => ({
      ...page,
      messages: page.messages.map((m) => {
        if (m.id === message.id || m.client_id === message.client_id) {
          found = true;
          return message;
        }
        return m;
      }),
    }));
    if (!found && pages.length > 0) {
      pages[0] = { ...pages[0], messages: [...pages[0].messages, message] };
    }
    return { ...data, pages };
  });
}

function markDeleted(qc: QueryClient, conversationId: number, id: number) {
  qc.setQueryData<Pages>(messagesKey(conversationId), (data) =>
    data && {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        messages: page.messages.map((m) => (m.id === id ? { ...m, deleted: true, body: "" } : m)),
      })),
    },
  );
}

export interface Typist {
  userId: string;
  name: string;
}

/** Messages for one conversation: history from the API, live updates from Centrifugo, and a
 *  polling fallback while the live connection is down. */
export function useChat(conversationId: number, me: Me | undefined) {
  const qc = useQueryClient();
  const live = useRealtimeConnected();
  const [typists, setTypists] = useState<Typist[]>([]);
  const [online, setOnline] = useState<number | null>(null);
  const typingSub = useRef<Subscription | null>(null);
  const lastTypingSent = useRef(0);

  const messages = useInfiniteQuery({
    queryKey: messagesKey(conversationId),
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      apiFetch<MessagePage>(
        `/api/chat/conversations/${conversationId}/messages?limit=40${
          pageParam ? `&before=${pageParam}` : ""
        }`,
      ),
    getNextPageParam: (last) => (last.has_more ? last.messages[0]?.id : undefined),
    refetchInterval: live ? false : 5_000,
  });

  useEffect(() => {
    let cancelled = false;
    const subs: Subscription[] = [];
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const tokens = () =>
      apiFetch<{ channel: string; token: string; typing_channel: string; typing_token: string }>(
        `/api/chat/conversations/${conversationId}/realtime`,
      );

    getRealtime().then(async (centrifuge) => {
      if (!centrifuge || cancelled) return;
      const first = await tokens().catch(() => null);
      if (!first || cancelled) return;

      const chat =
        centrifuge.getSubscription(first.channel) ??
        centrifuge.newSubscription(first.channel, {
          token: first.token,
          getToken: async () => (await tokens()).token,
        });
      chat.on("publication", (ctx: PublicationContext) => {
        if (ctx.info) return; // only the server publishes chat events; ignore anything else
        if (ctx.data?.type === "message.created") upsert(qc, conversationId, ctx.data.message);
        if (ctx.data?.type === "message.deleted") markDeleted(qc, conversationId, ctx.data.id);
        qc.invalidateQueries({ queryKey: conversationsKey });
      });
      chat.on("subscribed", (ctx) => {
        // Missed events we couldn't recover: reload from the API instead.
        if (ctx.wasRecovering && !ctx.recovered) {
          qc.invalidateQueries({ queryKey: messagesKey(conversationId) });
        }
        chat.presenceStats().then((s) => !cancelled && setOnline(s.numUsers)).catch(() => {});
      });
      chat.subscribe();
      subs.push(chat);

      const typing =
        centrifuge.getSubscription(first.typing_channel) ??
        centrifuge.newSubscription(first.typing_channel, {
          token: first.typing_token,
          getToken: async () => (await tokens()).typing_token,
        });
      typing.on("publication", (ctx: PublicationContext) => {
        const userId = ctx.info?.user;
        if (!userId || userId === String(me?.id)) return;
        const name: string = ctx.info?.connInfo?.name ?? "Someone";
        setTypists((list) => [...list.filter((t) => t.userId !== userId), { userId, name }]);
        clearTimeout(timers.get(userId));
        timers.set(
          userId,
          setTimeout(() => setTypists((list) => list.filter((t) => t.userId !== userId)), 4_000),
        );
      });
      typing.subscribe();
      typingSub.current = typing;
      subs.push(typing);
    });

    const presence = setInterval(() => {
      const chat = subs[0];
      if (chat?.state === "subscribed") {
        chat.presenceStats().then((s) => setOnline(s.numUsers)).catch(() => {});
      }
    }, 20_000);

    return () => {
      cancelled = true;
      clearInterval(presence);
      timers.forEach(clearTimeout);
      typingSub.current = null;
      getRealtime().then((centrifuge) => {
        for (const sub of subs) {
          sub.unsubscribe();
          sub.removeAllListeners();
          centrifuge?.removeSubscription(sub);
        }
      });
    };
  }, [conversationId, qc, me?.id]);

  const send = useCallback(
    async (body: string, retryOf?: ChatMessage) => {
      if (!me) return;
      const optimistic: ChatMessage = retryOf
        ? { ...retryOf, pending: true, failed: false }
        : {
            id: -Date.now(),
            conversation_id: conversationId,
            client_id: crypto.randomUUID(),
            body,
            deleted: false,
            created_at: new Date().toISOString(),
            sender: {
              id: me.id,
              name: me.full_name,
              initials: `${me.first_name[0] ?? ""}${me.last_name[0] ?? ""}`.toUpperCase(),
              is_teacher: false,
            },
            pending: true,
          };
      upsert(qc, conversationId, optimistic);
      try {
        const saved = await apiFetch<ChatMessage>(
          `/api/chat/conversations/${conversationId}/messages`,
          {
            method: "POST",
            body: JSON.stringify({ body: optimistic.body, client_id: optimistic.client_id }),
          },
        );
        upsert(qc, conversationId, saved);
        qc.invalidateQueries({ queryKey: conversationsKey });
      } catch {
        upsert(qc, conversationId, { ...optimistic, pending: false, failed: true });
      }
    },
    [conversationId, me, qc],
  );

  const remove = useCallback(
    async (message: ChatMessage) => {
      await apiFetch(`/api/chat/messages/${message.id}`, { method: "DELETE" });
      markDeleted(qc, conversationId, message.id);
    },
    [conversationId, qc],
  );

  const markRead = useCallback(
    async (messageId: number) => {
      await apiFetch(`/api/chat/conversations/${conversationId}/read`, {
        method: "POST",
        body: JSON.stringify({ message_id: messageId }),
      }).catch(() => {});
      qc.invalidateQueries({ queryKey: conversationsKey });
    },
    [conversationId, qc],
  );

  /** Throttled "I'm typing" signal; never stored. */
  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSent.current < 2_000) return;
    lastTypingSent.current = now;
    typingSub.current?.publish({ typing: true }).catch(() => {});
  }, []);

  const list = messages.data
    ? [...messages.data.pages].reverse().flatMap((page) => page.messages)
    : [];

  return { messages, list, send, remove, markRead, notifyTyping, typists, online, live };
}
