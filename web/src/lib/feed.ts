"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";

export interface FeedPerson {
  id: number;
  name: string;
  initials: string;
  kind: "student" | "teacher" | "staff";
}

export interface FeedPost {
  id: number;
  author: FeedPerson;
  body: string;
  audiences: string[];
  attachments: { id: number; name: string; size: number; content_type: string }[];
  created_at: string;
  visibility: "visible" | "hidden" | "removed";
  reactions: Partial<Record<ReactionKind, number>>;
  my_reactions: ReactionKind[];
  comment_count: number;
  mine: boolean;
  can_moderate: boolean;
}

export interface FeedComment {
  id: number;
  parent_id: number | null;
  author: FeedPerson;
  body: string;
  created_at: string;
  visibility: "visible" | "hidden" | "removed";
  mine: boolean;
}

export interface QueuedReport {
  id: number;
  reason: string;
  details: string;
  reporter: string;
  created_at: string;
  target_type: "post" | "comment";
  target_id: number;
  post_id: number;
  body: string;
  author: string;
  visibility: string;
  reports_on_target: number;
}

export type ReactionKind = "helpful" | "thanks" | "agree";

export const reactionLabels: Record<ReactionKind, string> = {
  helpful: "Helpful",
  thanks: "Thanks",
  agree: "Agree",
};

export const reasonLabels: Record<string, string> = {
  spam: "Spam or advertising",
  harassment: "Harassment or bullying",
  inappropriate: "Inappropriate or cheating",
  off_topic: "Off topic for this space",
  other: "Something else",
};

export function useFeed(scope: string, q: string) {
  return useInfiniteQuery({
    queryKey: ["feed", scope, q],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ q });
      if (scope) params.set("scope", scope);
      if (pageParam) params.set("before", String(pageParam));
      return apiFetch<FeedPost[]>(`/api/feed/posts?${params}`);
    },
    getNextPageParam: (last) => (last.length >= 20 ? last[last.length - 1].id : undefined),
    refetchInterval: 60_000,
  });
}

export function useFeedAudiences() {
  return useQuery({
    queryKey: ["feed", "audiences"],
    queryFn: () =>
      apiFetch<{ key: string; label: string; group: string; detail: string }[]>("/api/feed/audiences"),
    staleTime: 5 * 60_000,
  });
}

export function useComments(postId: number, enabled: boolean) {
  return useQuery({
    queryKey: ["feed", "comments", postId],
    queryFn: () => apiFetch<FeedComment[]>(`/api/feed/posts/${postId}/comments`),
    enabled,
  });
}

export function useModerationSummary() {
  return useQuery({
    queryKey: ["moderation", "summary"],
    queryFn: () => apiFetch<{ can_moderate: boolean; open: number }>("/api/feed/moderation/summary"),
    refetchInterval: 120_000,
  });
}

export function useReports() {
  return useQuery({
    queryKey: ["moderation", "reports"],
    queryFn: () => apiFetch<QueuedReport[]>("/api/feed/moderation/reports"),
  });
}
