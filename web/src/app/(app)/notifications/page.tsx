"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AssignmentsIcon,
  BellIcon,
  CalendarIcon,
  FeedIcon,
  FlagIcon,
  NoticesIcon,
  PersonIcon,
  ResourcesIcon,
  TimetableIcon,
} from "@/components/icons";
import { relativeTime } from "@/lib/format";
import { useMarkRead, useNotifications } from "@/lib/notifications";
import { type RepRequest, useRepAnswer, useRepRequestsIf } from "@/lib/reps";
import type { AppNotification, NotificationKind } from "@/lib/types";
import { PageTitle } from "@/components/page-title";

const icons: Partial<Record<NotificationKind, typeof BellIcon>> = {
  "notice.published": NoticesIcon,
  "class.changed": TimetableIcon,
  "assignment.opened": AssignmentsIcon,
  "assignment.due_soon": AssignmentsIcon,
  "grades.released": AssignmentsIcon,
  "feed.comment": FeedIcon,
  "moderation.action": FlagIcon,
  "resource.shared": ResourcesIcon,
  "account.correction": PersonIcon,
  "event.update": CalendarIcon,
  "class.rep": TimetableIcon,
  "class.reminder": TimetableIcon,
};

/** A CR/GR notification's request, so its Approve / "Did you know?" buttons sit right on it. */
function RepButtons({ link, requests }: { link: string; requests: RepRequest[] }) {
  const id = Number(/request-(\d+)/.exec(link)?.[1]);
  const r = requests.find((x) => x.id === id);
  const answer = useRepAnswer();
  if (!r || !(r.can_decide || r.can_reply)) return null;
  const button = "press h-8 rounded-full px-3 text-footnote font-semibold disabled:opacity-60";
  const go = (kind: "decide" | "reply", yes: boolean) => answer.mutate({ id: r.id, kind, yes });
  return (
    <span className="mt-2 flex flex-wrap gap-2">
      {r.can_decide ? (
        <>
          <button disabled={answer.isPending} onClick={() => go("decide", true)} className={`${button} bg-accent text-on-accent`}>Approve</button>
          <button disabled={answer.isPending} onClick={() => go("decide", false)} className={`${button} bg-fill-strong`}>Decline</button>
        </>
      ) : (
        <>
          <button disabled={answer.isPending} onClick={() => go("reply", true)} className={`${button} bg-accent text-on-accent`}>Yes, I knew</button>
          <button disabled={answer.isPending} onClick={() => go("reply", false)} className={`${button} text-danger-ink hover:bg-danger/10`}>No, undo it</button>
        </>
      )}
    </span>
  );
}

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

export default function NotificationsPage() {
  const router = useRouter();
  const notifications = useNotifications();
  const markRead = useMarkRead();
  const items = notifications.data?.items ?? [];
  const unread = notifications.data?.unread ?? 0;
  const hasRep = items.some((n) => n.kind === "class.rep");
  const repRequests = useRepRequestsIf(hasRep);

  async function open(n: AppNotification) {
    if (!n.read) markRead([n.id]);
    if (n.link) router.push(n.link);
  }

  const groups: [string, AppNotification[]][] = [
    ["Today", items.filter((n) => isToday(n.created_at))],
    ["Earlier", items.filter((n) => !isToday(n.created_at))],
  ];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-body font-semibold text-ink-2">
            {unread ? `${unread} unread` : "You're all caught up"}
          </p>
          <PageTitle className="mt-1 text-large-title font-bold" text="Notifications" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/profile#notifications"
            className="press inline-flex h-10 items-center rounded-full px-4 text-footnote font-semibold text-accent-ink hover:bg-fill"
          >
            Settings
          </Link>
          {unread > 0 && (
            <button
              onClick={() => markRead()}
              className="press h-10 rounded-full bg-fill-strong px-4 text-footnote font-semibold"
            >
              Mark all as read
            </button>
          )}
        </div>
      </header>

      {notifications.isPending && <p className="text-body text-ink-2">Loading…</p>}
      {notifications.isSuccess && items.length === 0 && (
        <div className="glass rounded-card p-6">
          <p className="text-headline font-semibold">Nothing yet</p>
          <p className="mt-1 text-body text-ink-2">
            New notices, class changes, assignments, deadlines and grades will show up here.
          </p>
        </div>
      )}

      {groups
        .filter(([, list]) => list.length > 0)
        .map(([title, list]) => (
          <section key={title} aria-label={title} className="glass rounded-card p-3">
            <h2 className="px-3 pt-2 pb-1 text-headline font-semibold">{title}</h2>
            <ul className="stagger">
              {list.map((n) => {
                const Icon = icons[n.kind] ?? BellIcon;
                return (
                  <li key={n.id} className="flex flex-col">
                    <button
                      onClick={() => open(n)}
                      className="press flex w-full items-start gap-3 rounded-row p-3 text-left hover:bg-fill"
                    >
                      <span
                        className={`grid size-9 shrink-0 place-items-center rounded-full ${
                          n.read ? "bg-fill-strong text-ink-2" : "bg-accent/15 text-accent-ink"
                        }`}
                      >
                        <Icon className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-body ${n.read ? "text-ink-2" : "font-semibold"}`}>
                          {n.title}
                        </span>
                        {n.body && <span className="block text-footnote text-ink-2">{n.body}</span>}
                        <span className="mt-0.5 block text-caption text-ink-3">{relativeTime(n.created_at)}</span>
                      </span>
                      {!n.read && (
                        <span className="mt-2 size-2.5 shrink-0 rounded-full bg-accent">
                          <span className="sr-only">Unread</span>
                        </span>
                      )}
                    </button>
                    {n.kind === "class.rep" && (
                      <span className="pb-2 pl-15">
                        <RepButtons link={n.link} requests={repRequests.data ?? []} />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
    </div>
  );
}
