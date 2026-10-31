"use client";

import { useRouter } from "next/navigation";
import { AssignmentsIcon, BellIcon, NoticesIcon, TimetableIcon } from "@/components/icons";
import { relativeTime } from "@/lib/format";
import { useMarkRead, useNotifications } from "@/lib/notifications";
import type { AppNotification, NotificationKind } from "@/lib/types";

const icons: Record<NotificationKind, typeof BellIcon> = {
  "notice.published": NoticesIcon,
  "class.changed": TimetableIcon,
  "assignment.opened": AssignmentsIcon,
  "assignment.due_soon": AssignmentsIcon,
  "grades.released": AssignmentsIcon,
};

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

export default function NotificationsPage() {
  const router = useRouter();
  const notifications = useNotifications();
  const markRead = useMarkRead();
  const items = notifications.data?.items ?? [];
  const unread = notifications.data?.unread ?? 0;

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
          <h1 className="mt-1 text-large-title font-bold">Notifications</h1>
        </div>
        {unread > 0 && (
          <button
            onClick={() => markRead()}
            className="press h-10 rounded-full bg-fill-strong px-4 text-footnote font-semibold"
          >
            Mark all as read
          </button>
        )}
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
            <ul>
              {list.map((n) => {
                const Icon = icons[n.kind] ?? BellIcon;
                return (
                  <li key={n.id}>
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
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
    </div>
  );
}
