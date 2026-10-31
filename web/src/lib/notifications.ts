"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PublicationContext } from "centrifuge";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "./api";
import { getRealtime, useRealtimeConnected } from "./realtime";
import type { AppNotification, NotificationKind } from "./types";

const key = ["notifications"] as const;

export function useNotifications() {
  const live = useRealtimeConnected();
  return useQuery({
    queryKey: key,
    queryFn: () => apiFetch<{ items: AppNotification[]; unread: number }>("/api/notifications"),
    // Live pushes refresh this instantly; polling is only the fallback.
    refetchInterval: live ? 5 * 60_000 : 60_000,
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useCallback(
    async (ids?: number[]) => {
      await apiFetch("/api/notifications/read", {
        method: "POST",
        body: JSON.stringify(ids ? { ids } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: key });
    },
    [queryClient],
  );
}

/** What else on screen a notification makes stale. */
const affects: Record<NotificationKind, string[][]> = {
  "notice.published": [["notices"]],
  "class.changed": [["timetable"], ["notices"]],
  "assignment.opened": [["assignments"]],
  "assignment.due_soon": [["assignments"]],
  "grades.released": [["assignments"]],
  "feed.comment": [["feed"]],
  "moderation.action": [["feed"]],
  "resource.shared": [["resources"]],
};

export interface Toast {
  id: number;
  title: string;
  body: string;
  link: string;
}

/** Subscribes to the signed-in user's personal channel; returns toasts to show. */
export function useLiveNotifications(userId: number | undefined) {
  const queryClient = useQueryClient();
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let cleanup = () => {};
    getRealtime().then((centrifuge) => {
      if (!centrifuge || cancelled) return;
      const channel = `user:#${userId}`;
      // A user-limited channel: Centrifugo only lets this user's connection subscribe.
      const sub = centrifuge.getSubscription(channel) ?? centrifuge.newSubscription(channel);
      const onPublication = (ctx: PublicationContext) => {
        if (ctx.info || ctx.data?.type !== "notification.created") return;
        queryClient.invalidateQueries({ queryKey: key });
        for (const k of affects[ctx.data.kind as NotificationKind] ?? []) {
          queryClient.invalidateQueries({ queryKey: k });
        }
        const toast = { id: Date.now() + Math.random(), ...ctx.data } as Toast;
        setToasts((list) => [...list.slice(-2), toast]);
        setTimeout(() => dismiss(toast.id), 6_000);
      };
      sub.on("publication", onPublication);
      sub.subscribe();
      cleanup = () => {
        sub.removeListener("publication", onPublication);
        sub.unsubscribe();
        centrifuge.removeSubscription(sub);
      };
    });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [userId, queryClient, dismiss]);

  return { toasts, dismiss };
}
