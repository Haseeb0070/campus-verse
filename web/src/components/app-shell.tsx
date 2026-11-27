"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { reportError } from "@/lib/errors";
import { AppearanceToggle } from "@/components/appearance-toggle";
import dynamic from "next/dynamic";

// The guide draws with browser-only APIs, so it loads in the browser only.
const Helper = dynamic(() => import("@/components/helper/helper"), { ssr: false });
import { signOut } from "@/lib/auth";
import { useUnreadTotal } from "@/lib/chat";
import { courseBg } from "@/lib/format";
import { useMe } from "@/lib/queries";
import { disconnectRealtime } from "@/lib/realtime";
import { useModerationSummary } from "@/lib/feed";
import { useRepRequestsIf, useRepsMine } from "@/lib/reps";
import { useLiveNotifications, useNotifications } from "@/lib/notifications";
import { PageEnter } from "@/components/page-enter";
import {
  AssignmentsIcon,
  BellIcon,
  CalendarIcon,
  ChecklistIcon,
  ChatIcon,
  FeedIcon,
  FlagIcon,
  LogoMark,
  ManageIcon,
  MoreIcon,
  NoticesIcon,
  PersonIcon,
  ProgressIcon,
  ResourcesIcon,
  SearchIcon,
  SectionsIcon,
  SidebarIcon,
  SignOutIcon,
  TimetableIcon,
  TodayIcon,
} from "./icons";
import { Toasts } from "./toasts";

type NavGroup = "Overview" | "Academics" | "Community" | "Administration";
type NavItem = {
  href: string;
  label: string;
  Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactNode;
  group: NavGroup;
};
const NAV_GROUPS: NavGroup[] = ["Overview", "Academics", "Community", "Administration"];

function UnreadBadge({
  count,
  label = "unread",
  className = "",
}: {
  count: number;
  label?: string;
  className?: string;
}) {
  if (!count) return null;
  return (
    <span
      className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-caption font-semibold ${className || "bg-accent text-on-accent"}`}
    >
      <span className="sr-only">
        {count} {label}
      </span>
      <span aria-hidden="true">{count > 99 ? "99+" : count}</span>
    </span>
  );
}

/** Where the sidebar's current-page highlight sits. It slides there from the previous page; the
 *  first placement (or one after a page with no sidebar link) doesn't animate. */
function useNavPill(deps: unknown[]) {
  const ref = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ y: number; h: number; slide: boolean } | null>(null);
  useLayoutEffect(() => {
    const link = ref.current?.querySelector<HTMLElement>('ul a[aria-current="page"]');
    setPill((prev) => (link ? { y: link.offsetTop, h: link.offsetHeight, slide: prev != null } : null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { ref, pill };
}

const MINI_KEY = "cv-nav-mini";

/** The sidebar shrunk to its icons, or full width. Kept on this device. */
function useMiniNav(): [boolean, () => void] {
  const [mini, setMini] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem(MINI_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setMini((m) => {
      try {
        localStorage.setItem(MINI_KEY, m ? "0" : "1");
      } catch {
        // Storage blocked: the choice lasts for this visit.
      }
      return !m;
    });
  return [mini, toggle];
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);
  const unread = useUnreadTotal();
  const notificationsUnread = useNotifications().data?.unread ?? 0;
  const moderation = useModerationSummary().data;
  const repsMine = useRepsMine(me.data?.kind === "student").data;
  const isRep = Object.keys(repsMine?.sections ?? {}).length > 0;
  const teachesAny = me.data?.sections.some((s) => s.teaching) ?? false;
  const repWaiting = (useRepRequestsIf(isRep || teachesAny).data ?? []).filter((r) => r.can_decide || r.can_reply).length;
  const { toasts, dismiss } = useLiveNotifications(me.data?.id);
  const badgeFor = (href: string) =>
    href === "/chat"
      ? unread
      : href === "/notifications"
        ? notificationsUnread
        : href === "/moderation"
          ? (moderation?.open ?? 0)
          : href === "/requests"
            ? repWaiting
            : 0;
  const badgeLabel = (href: string) =>
    href === "/moderation" ? "open reports" : href === "/requests" ? "waiting for you" : "unread";
  const [moreOpen, setMoreOpen] = useState(false);
  const [mini, toggleMini] = useMiniNav();
  // The page a nav link was just clicked for. Highlights move there at once instead of after the
  // next page arrives (a server round trip, plus a compile on first visit in development). Once
  // the path changes, the real path takes over again.
  const [goingTo, setGoingTo] = useState<{ href: string; from: string } | null>(null);
  const at = goingTo && goingTo.from === pathname ? goingTo.href : pathname;
  // True between a nav click and the new page arriving: the current page steps back at once, so
  // the content answers the click together with the highlight instead of sitting there unchanged.
  const leaving = at !== pathname;
  const side = useNavPill([at, me.data, moderation?.can_moderate, mini]);
  // Fetch every page in the menus ahead of time, once the app is idle, so a click only has to
  // swap the page in. (Production builds also prefetch links as they scroll into view.)
  useEffect(() => {
    if (!me.data) return;
    const hrefs = new Set(
      [...document.querySelectorAll<HTMLAnchorElement>('nav a[href^="/"]')].map((a) => a.getAttribute("href")!),
    );
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 300));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const id = idle(() => hrefs.forEach((href) => router.prefetch(href)));
    return () => cancel(id);
  }, [me.data, moderation?.can_moderate, router]);
  // Macs show the search shortcut as ⌘K. Read after mount so server and client markup agree.
  const [modKey, setModKey] = useState("Ctrl");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setModKey("⌘");
  }, []);
  // Name the page in the browser tab and for screen readers: "Notices · CampusVerse". These pages
  // are client components (no per-page metadata), and Next writes the layout's title into <head>
  // after hydration, so reapply ours whenever the head changes.
  useEffect(() => {
    const section = pathname.split("/")[1];
    const title = section ? `${section[0].toUpperCase()}${section.slice(1)} · CampusVerse` : "CampusVerse";
    const apply = () => {
      if (document.title !== title) document.title = title;
    };
    apply();
    const watch = new MutationObserver(apply);
    watch.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => watch.disconnect();
  }, [pathname]);

  const unauthorized = me.error instanceof ApiError && me.error.status === 401;
  useEffect(() => {
    // A full page load, so the landing page starts clean (its own title and light look).
    if (unauthorized) window.location.replace(`/?next=${encodeURIComponent(pathname)}`);
  }, [unauthorized, router, pathname]);

  // Search from anywhere: Ctrl/Cmd+K, or "/" when not typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.("input, textarea, [contenteditable=true]");
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        router.push("/search");
      }
      // Ctrl/Cmd+\ shrinks the sidebar to icons, or opens it again.
      if (e.key === "\\" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        toggleMini();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

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
    } catch {
      setSigningOut(false);
      reportError("Couldn't sign you out. Check your connection and try again.");
      return;
    }
    disconnectRealtime();
    queryClient.clear();
    // A full page load: nothing of this account stays in the page's memory for the next person.
    window.location.replace("/");
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
  const isAdmin = user.roles.includes("institution_admin");
  // Timetable, assignments and resources are about one's own classes: staff with none (an
  // admin who doesn't teach) don't get pages that could only ever be empty.
  const hasClasses = user.kind !== "staff" || user.sections.length > 0;
  const nav: NavItem[] = [
    { href: "/today", label: "Today", Icon: TodayIcon, group: "Overview" },
    ...(hasClasses ? [{ href: "/timetable", label: "Timetable", Icon: TimetableIcon, group: "Overview" as const }] : []),
    { href: "/calendar", label: "Calendar", Icon: CalendarIcon, group: "Overview" },
    ...(teaches ? [{ href: "/sections", label: "Subjects", Icon: SectionsIcon, group: "Academics" as const }] : []),
    ...(hasClasses
      ? [
          { href: "/assignments", label: "Assignments", Icon: AssignmentsIcon, group: "Academics" as const },
          { href: "/resources", label: "Resources", Icon: ResourcesIcon, group: "Academics" as const },
        ]
      : []),
    ...(teaches && user.institution?.attendance_enabled
      ? [{ href: "/attendance", label: "Attendance", Icon: ChecklistIcon, group: "Academics" as const }]
      : []),
    ...(teaches || isRep
      ? [{ href: "/requests", label: "Class requests", Icon: ChecklistIcon, group: "Academics" as const }]
      : []),
    ...(user.kind === "student"
      ? [{ href: "/progress", label: "Progress", Icon: ProgressIcon, group: "Academics" as const }]
      : []),
    { href: "/feed", label: "Feed", Icon: FeedIcon, group: "Community" },
    { href: "/chat", label: "Chat", Icon: ChatIcon, group: "Community" },
    { href: "/notices", label: "Notices", Icon: NoticesIcon, group: "Community" },
    { href: "/notifications", label: "Notifications", Icon: BellIcon, group: "Community" },
    ...(moderation?.can_moderate
      ? [{ href: "/moderation", label: "Moderation", Icon: FlagIcon, group: "Administration" as const }]
      : []),
    ...(isAdmin
      ? [{ href: "/manage", label: "Manage", Icon: ManageIcon, group: "Administration" as const }]
      : user.roles.includes("department_coordinator")
        ? [{ href: "/manage/academic", label: "Department", Icon: ManageIcon, group: "Administration" as const }]
        : []),
  ];
  // Phones get four tabs; everything else sits under More.
  const primaryHrefs = hasClasses ? ["/today", "/timetable", "/assignments", "/chat"] : ["/today", "/notices", "/chat", "/manage"];
  const primaryNav = nav.filter((n) => primaryHrefs.includes(n.href));
  const secondaryNav = nav.filter((n) => !primaryHrefs.includes(n.href));
  const isActive = (href: string) => at === href || at.startsWith(`${href}/`);
  // A plain click (not one that opens a new tab or window) moves the highlight straight away.
  const goTo = (href: string) => (e: React.MouseEvent) => {
    if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) setGoingTo({ href, from: pathname });
  };
  const initials = `${(user.preferred_name || user.first_name)[0] ?? ""}${user.last_name[0] ?? ""}` || user.email[0];

  return (
    <div className="min-h-screen md:flex">
      <a
        href="#main"
        // Only for keyboard users (Tab): a mouse click or a page change never shows it.
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-50 focus-visible:rounded-control focus-visible:bg-accent focus-visible:px-4 focus-visible:py-2.5 focus-visible:text-footnote focus-visible:font-semibold focus-visible:text-on-accent focus-visible:shadow-lg"
      >
        Skip to content
      </a>
      <nav
        ref={side.ref}
        aria-label="Main"
        className={`side sticky top-0 hidden h-screen shrink-0 flex-col gap-4 overflow-x-hidden overflow-y-auto border-r border-side-line py-5 transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] md:flex motion-reduce:transition-none ${
          mini ? "w-[76px] px-3" : "w-64 px-3.5"
        }`}
      >
        <span
          aria-hidden="true"
          className={`nav-pill pointer-events-none absolute top-0 rounded-control bg-side-active ${mini ? "inset-x-3" : "inset-x-3.5"} ${
            side.pill ? "" : "opacity-0"
          }`}
          style={{
            height: side.pill?.h ?? 40,
            transform: `translateY(${side.pill?.y ?? 0}px)`,
            transition: side.pill?.slide ? undefined : "none",
          }}
        />
        <div
          className={`flex border-b border-side-line pb-4 ${mini ? "flex-col items-center gap-3" : "items-center gap-3 px-1.5"}`}
        >
          <LogoMark className="size-9 shrink-0" />
          {!mini && (
            <span className="min-w-0 flex-1">
              <span className="block text-headline font-bold text-side-strong">CampusVerse</span>
              <span className="block truncate text-caption text-side-muted">
                {user.institution?.name ?? "No institution"}
              </span>
            </span>
          )}
          <button
            type="button"
            onClick={toggleMini}
            aria-expanded={!mini}
            aria-label={mini ? "Show the full sidebar" : "Shrink the sidebar to icons"}
            title={`${mini ? "Show the full sidebar" : "Shrink the sidebar to icons"} (${modKey} \\)`}
            className="press grid size-9 shrink-0 place-items-center rounded-control text-side-muted transition-colors hover:bg-side-hover hover:text-side-strong"
          >
            <SidebarIcon className="size-5" />
          </button>
        </div>

        <Link
          href="/search"
          aria-label={`Search (${modKey} K)`}
          title={mini ? `Search (${modKey} K)` : undefined}
          className={`flex h-10 shrink-0 items-center gap-2.5 rounded-control border border-white/10 bg-white/[0.06] text-footnote text-side-muted transition-colors hover:bg-white/[0.12] hover:text-side-strong ${
            mini ? "justify-center" : "px-3"
          }`}
        >
          <SearchIcon className="size-[18px] shrink-0" />
          {!mini && (
            <>
              <span className="flex-1">Search</span>
              <kbd className="rounded-md border border-white/15 bg-white/10 px-1.5 py-px font-sans text-caption font-semibold text-side-ink">
                {modKey} K
              </kbd>
            </>
          )}
        </Link>

        {NAV_GROUPS.map((group) => {
          const items = nav.filter((n) => n.group === group);
          if (!items.length) return null;
          return (
            <div key={group}>
              {mini ? (
                <p className="sr-only">{group}</p>
              ) : (
                <p className="px-3 pb-1.5 text-caption font-semibold text-side-muted">{group}</p>
              )}
              <ul className="flex flex-col gap-0.5">
                {items.map(({ href, label, Icon }) => {
                  const active = isActive(href);
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        onClick={goTo(href)}
                        aria-current={active ? "page" : undefined}
                        title={mini ? label : undefined}
                        className={`press group relative flex h-10 items-center gap-3 rounded-control text-footnote font-semibold transition-colors ${
                          mini ? "justify-center" : "px-3"
                        } ${active ? "text-on-active" : "text-side-ink hover:bg-side-hover hover:text-side-strong"}`}
                      >
                        <Icon className={`size-[18px] shrink-0 ${active ? "text-on-active" : "text-side-icon group-hover:text-side-strong"}`} />
                        <span className={mini ? "sr-only" : "flex-1"}>{label}</span>
                        <UnreadBadge
                          count={badgeFor(href)}
                          label={badgeLabel(href)}
                          className={`${mini ? "absolute -top-0.5 right-0.5 !h-4 !min-w-4 !px-1 !text-[10px]" : ""} ${
                            active ? "bg-on-active text-side-active" : "bg-side-active text-on-active"
                          }`}
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}

        {courses.length > 0 && !mini && (
          <div>
            <p className="px-3 pb-1.5 text-caption font-semibold text-side-muted">Your courses</p>
            <ul className="flex flex-col gap-0.5">
              {courses.map((c) => (
                <li key={c.course_code} className="flex h-8 items-center gap-2.5 px-3 text-caption">
                  <span className={`size-2 shrink-0 rounded-full ${courseBg[c.color]}`} aria-hidden="true" />
                  <span className="shrink-0 font-semibold text-side-strong">{c.course_code}</span>
                  <span className="min-w-0 flex-1 truncate text-side-muted">{c.course_title}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div
          className={`mt-auto flex border-t border-side-line pt-3 ${mini ? "flex-col items-center gap-1" : "items-center gap-1"}`}
        >
          <Link
            href="/profile"
            aria-current={isActive("/profile") ? "page" : undefined}
            aria-label={mini ? `Your profile, ${user.full_name}` : undefined}
            title="Your profile"
            className={`flex min-w-0 items-center gap-2.5 rounded-control p-1.5 transition-colors hover:bg-side-hover ${mini ? "" : "flex-1"}`}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full border border-side-active bg-side-avatar text-footnote font-bold text-side-avatar-ink">
              {initials.toUpperCase()}
            </span>
            {!mini && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-footnote font-semibold text-side-strong">{user.full_name}</span>
                <span className="block truncate text-caption capitalize text-side-muted">{user.kind}</span>
              </span>
            )}
          </Link>
          <AppearanceToggle className="grid size-9 place-items-center rounded-control text-side-muted transition-colors hover:bg-side-hover hover:text-side-strong" />
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            aria-label="Sign out"
            title="Sign out"
            className="grid size-9 place-items-center rounded-control text-side-muted transition-colors hover:bg-danger/20 hover:text-side-strong"
          >
            <SignOutIcon className="size-5" />
          </button>
        </div>
      </nav>

      <main
        id="main"
        tabIndex={-1}
        aria-busy={leaving || undefined}
        className="relative min-w-0 flex-1 px-4 pb-40 pt-6 outline-none md:px-8 md:pb-28 md:pt-7"
      >
        {leaving && <span aria-hidden="true" className="nav-progress" />}
        <div className={`transition-opacity duration-150 ease-out ${leaving ? "pointer-events-none opacity-40" : ""}`}>
          {/* Today choreographs its own entrance; chat animates once, not on every conversation. */}
          {pathname === "/today" ? children : <PageEnter key={pathname.startsWith("/chat") ? "/chat" : pathname}>{children}</PageEnter>}
        </div>
      </main>

      {moreOpen && (
        <>
          <button
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
            className="fixed inset-0 z-10 cursor-default md:hidden"
          />
          <div
            id="more-menu"
            className="glass-thick arrive fixed right-3 bottom-20 z-20 flex w-56 origin-bottom-right flex-col rounded-card p-1.5 md:hidden"
          >
            {secondaryNav.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={(e) => {
                  goTo(href)(e);
                  setMoreOpen(false);
                }}
                aria-current={isActive(href) ? "page" : undefined}
                className={`press flex h-11 items-center gap-3 rounded-control px-3 text-body font-medium hover:bg-fill ${
                  isActive(href) ? "bg-fill-strong text-accent-ink" : ""
                }`}
              >
                <Icon className="size-5" />
                <span className="flex-1">{label}</span>
                <UnreadBadge count={badgeFor(href)} label={badgeLabel(href)} />
              </Link>
            ))}
            <Link
              href="/search"
              onClick={() => setMoreOpen(false)}
              aria-current={isActive("/search") ? "page" : undefined}
              className={`press flex h-11 items-center gap-3 rounded-control px-3 text-body font-medium hover:bg-fill ${
                isActive("/search") ? "bg-fill-strong text-accent-ink" : ""
              }`}
            >
              <SearchIcon className="size-5" />
              <span className="flex-1">Search</span>
            </Link>
            <Link
              href="/profile"
              onClick={() => setMoreOpen(false)}
              aria-current={isActive("/profile") ? "page" : undefined}
              className={`press flex h-11 items-center gap-3 rounded-control px-3 text-body font-medium hover:bg-fill ${
                isActive("/profile") ? "bg-fill-strong text-accent-ink" : ""
              }`}
            >
              <PersonIcon className="size-5" />
              <span className="flex-1">Profile</span>
            </Link>
            <AppearanceToggle
              withLabel
              className="press flex h-11 items-center gap-3 rounded-control px-3 text-body font-medium hover:bg-fill"
            />
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="press flex h-11 items-center gap-3 rounded-control px-3 text-body font-medium hover:bg-fill text-danger-ink"
            >
              <SignOutIcon className="size-5" />
              Sign out
            </button>
          </div>
        </>
      )}

      <nav
        aria-label="Tabs"
        className="side fixed inset-x-0 bottom-0 z-20 flex border-t border-side-line px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] md:hidden"
      >
        {primaryNav.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={goTo(href)}
            aria-current={isActive(href) ? "page" : undefined}
            className={`press relative flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-control text-[11px] font-semibold ${
              isActive(href) ? "text-side-avatar-ink" : "text-side-muted"
            }`}
          >
            <Icon className="size-[22px]" />
            <span className="max-w-full truncate">{label}</span>
            <UnreadBadge
              count={badgeFor(href)}
              label={badgeLabel(href)}
              className="absolute top-0.5 left-1/2 bg-side-active text-on-active"
            />
          </Link>
        ))}
        <button
          onClick={() => setMoreOpen((o) => !o)}
          aria-expanded={moreOpen}
          aria-controls="more-menu"
          className={`relative flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-control text-[11px] font-semibold ${
            moreOpen || secondaryNav.some((n) => isActive(n.href)) ? "text-side-avatar-ink" : "text-side-muted"
          }`}
        >
          <MoreIcon className="size-[22px]" />
          More
          <UnreadBadge
            count={secondaryNav.reduce((sum, n) => sum + badgeFor(n.href), 0)}
            className="absolute top-0.5 left-1/2 bg-side-active text-on-active"
          />
        </button>
      </nav>

      <Toasts toasts={toasts} onDismiss={dismiss} />
      <Helper />
    </div>
  );
}
