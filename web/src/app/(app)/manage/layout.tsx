"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMe } from "@/lib/queries";

const tabs = [
  { href: "/manage", label: "Overview" },
  { href: "/manage/people", label: "People" },
  { href: "/manage/import", label: "Timetable import" },
  { href: "/manage/audit", label: "Audit log" },
];

export default function ManageLayout({ children }: { children: React.ReactNode }) {
  const me = useMe().data;
  const pathname = usePathname();
  if (!me) return null;
  if (!me.roles.includes("institution_admin")) {
    return (
      <div className="glass mx-auto max-w-xl rounded-card p-6">
        <p className="text-headline font-semibold">This area is for institution admins</p>
        <p className="mt-1 text-body text-ink-2">Ask an admin if you need access.</p>
      </div>
    );
  }
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <nav aria-label="Manage" className="glass flex gap-1 self-start overflow-x-auto rounded-full p-1">
        {tabs.map((t) => {
          const active = t.href === "/manage" ? pathname === t.href : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`press whitespace-nowrap rounded-full px-4 py-2 text-footnote font-semibold ${
                active ? "bg-accent text-on-accent" : "text-ink-2 hover:bg-fill"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
