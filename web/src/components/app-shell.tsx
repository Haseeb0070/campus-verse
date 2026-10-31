"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { signOut } from "@/lib/auth";
import { useUnreadTotal } from "@/lib/chat";
import { courseBg } from "@/lib/format";
import { useMe } from "@/lib/queries";
import { disconnectRealtime } from "@/lib/realtime";
import {
  AssignmentsIcon,
  ChatIcon,
  LogoMark,
  MoreIcon,
  NoticesIcon,
  SectionsIcon,
  SignOutIcon,
  TimetableIcon,
  TodayIcon,
} from "./icons";

const baseNav = [
  { href: "/today", label: "Today", Icon: TodayIcon },
  { href: "/timetable", label: "Timetable", Icon: TimetableIcon },
  { href: "/assignments", label: "Assignments", Icon: AssignmentsIcon },
  { href: "/chat", label: "Chat", Icon: ChatIcon },
  { href: "/notices", label: "Notices", Icon: NoticesIcon },
];

function UnreadBadge({ count, className = "" }: { count: number; className?: string }) {
  if (!count) return null;
  return (
    <span
      className={`grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-caption font-semibold text-on-accent ${className}`}
    >
      <span className="sr-only">{count} unread</span>
      <span aria-hidden="true">{count > 99 ? "99+" : count}</span>
    </span>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);
  const unread = useUnreadTotal();
  const [moreOpen, setMoreOpen] = useState(false);

  const unauthorized = me.error instanceof ApiError && me.error.status === 401;
  useEffect(() => {
    if (unauthorized) router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
  }, [unauthorized, router, pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMoreOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      disconnectRealtime();
      queryClient.clear();
      router.replace("/sign-in");
    }
  }

  if (me.isPending || unauthorized) {
    return <div className="min-h-screen" aria-busy="true" aria-label="Loading" />;
  }
  if (me.isError) {
    return (
      <div className="grid min-h-screen place-items-center p-4">
        <div className="glass max-w-sm rounded-card p-6 text-center">
          <p className="text-headline font-semibold">CampusVerse isn&apos;t responding</p>
          <p className="mt-1 text-body text-ink-2">Check your connection, then try again.</p>
          <button
            onClick={() => me.refetch()}
            className="press mt-4 h-11 rounded-full bg-accent px-5 text-body font-semibold text-on-accent"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const user = me.data;
  const courses = [...new Map(user.sections.map((s) => [s.course_code, s])).values()];
  const teaches = user.sections.some((s) => s.teaching);
  const nav = teaches
    ? [
        ...baseNav.slice(0, 2),
        { href: "/sections", label: "Sections", Icon: SectionsIcon },
        ...baseNav.slice(2),
      ]
    : baseNav;
  // Phones get four tabs; everything else sits under More.
  const primaryHrefs = ["/today", "/timetable", "/assignments", "/chat"];
  const primaryNav = nav.filter((n) => primaryHrefs.includes(n.href));
  const secondaryNav = nav.filter((n) => !primaryHrefs.includes(n.href));
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const initials = `${user.first_name[0] ?? ""}${user.last_name[0] ?? ""}` || user.email[0];

  return (
    <div className="min-h-screen md:flex md:gap-5 md:p-5">
      <nav
        aria-label="Main"
        className="glass-side sticky top-5 hidden h-[calc(100vh-2.5rem)] w-64 shrink-0 flex-col gap-5 rounded-card px-3 py-5 md:flex"
      >
        <div className="flex items-center gap-2.5 px-2">
          <LogoMark className="size-[34px]" />
          <span className="text-headline font-semibold">CampusVerse</span>
        </div>

        <ul className="flex flex-col gap-0.5">
          {nav.map(({ href, label, Icon }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive(href) ? "page" : undefined}
                className={`press flex h-10 items-center gap-3 rounded-control px-3 text-body font-medium ${
                  isActive(href) ? "bg-fill-strong text-accent-ink" : "hover:bg-fill"
                }`}
              >
                <Icon className="size-5" />
                <span className="flex-1">{label}</span>
                {href === "/chat" && <UnreadBadge count={unread} />}
              </Link>
            </li>
          ))}
        </ul>

        {courses.length > 0 && (
          <div>
            <p className="mb-1.5 px-3 text-caption font-semibold text-ink-3">Your courses</p>
            <ul className="flex flex-col gap-0.5">
              {courses.map((c) => (
                <li key={c.course_code} className="flex h-9 items-center gap-3 px-3 text-footnote">
                  <span className={`size-3 rounded ${courseBg[c.color]}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{c.course_title}</span>
                  <span className="text-caption text-ink-3">{c.course_code}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-auto flex items-center gap-2.5 rounded-row bg-fill p-2.5">
          <span className="grid size-9 place-items-center rounded-full bg-accent/15 text-footnote font-semibold text-accent-ink">
            {initials.toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-footnote font-semibold">{user.full_name}</span>
            <span className="block truncate text-caption text-ink-2">
              {user.institution?.name ?? "No institution"}
            </span>
          </span>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            aria-label="Sign out"
            title="Sign out"
            className="press grid size-9 place-items-center rounded-full text-ink-2 hover:bg-fill-strong"
          >
            <SignOutIcon className="size-5" />
          </button>
        </div>
      </nav>

      <main className="min-w-0 flex-1 px-4 pb-32 pt-8 md:px-2 md:pb-8 md:pt-3">{children}</main>

      {moreOpen && (
        <>
          <button
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
            className="fixed inset-0 z-10 cursor-default md:hidden"
          />
          <div
            id="more-menu"
            className="glass-thick arrive fixed right-4 bottom-24 z-20 flex w-56 origin-bottom-right flex-col rounded-[22px] p-1.5 md:hidden"
          >
            {secondaryNav.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMoreOpen(false)}
                aria-current={isActive(href) ? "page" : undefined}
                className={`press flex h-11 items-center gap-3 rounded-[16px] px-3 text-body font-medium ${
                  isActive(href) ? "bg-fill-strong text-accent-ink" : ""
                }`}
              >
                <Icon className="size-5" />
                {label}
              </Link>
            ))}
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="press flex h-11 items-center gap-3 rounded-[16px] px-3 text-body font-medium text-danger"
            >
              <SignOutIcon className="size-5" />
              Sign out
            </button>
          </div>
        </>
      )}

      <nav
        aria-label="Tabs"
        className="glass-thick fixed inset-x-4 bottom-5 z-20 flex rounded-full p-1 md:hidden"
      >
        {primaryNav.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className={`press relative flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-semibold ${
              isActive(href) ? "bg-fill-strong text-accent-ink" : "text-ink-2"
            }`}
          >
            <Icon className="size-[22px]" />
            <span className="max-w-full truncate">{label}</span>
            {href === "/chat" && <UnreadBadge count={unread} className="absolute top-1 left-1/2" />}
          </Link>
        ))}
        <button
          onClick={() => setMoreOpen((o) => !o)}
          aria-expanded={moreOpen}
          aria-controls="more-menu"
          className={`press flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-semibold ${
            moreOpen || secondaryNav.some((n) => isActive(n.href)) ? "bg-fill-strong text-accent-ink" : "text-ink-2"
          }`}
        >
          <MoreIcon className="size-[22px]" />
          More
        </button>
      </nav>
    </div>
  );
}
