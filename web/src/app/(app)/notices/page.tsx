"use client";

import { relativeTime } from "@/lib/format";
import { useNotices } from "@/lib/queries";

export default function NoticesPage() {
  const notices = useNotices();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header>
        <p className="text-body font-semibold text-ink-2">For your courses and campus</p>
        <h1 className="mt-1 text-large-title font-bold">Notices</h1>
      </header>

      {notices.isPending && <p className="text-body text-ink-2">Loading notices…</p>}
      {notices.isError && (
        <p role="alert" className="glass rounded-card p-6 text-body">
          Couldn&apos;t load notices. Check your connection and try again.
        </p>
      )}
      {notices.data?.length === 0 && (
        <div className="glass rounded-card p-6">
          <p className="text-headline font-semibold">No notices yet</p>
          <p className="mt-1 text-body text-ink-2">
            Notices from your teachers, department and campus will appear here.
          </p>
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {notices.data?.map((n) => (
          <li key={n.id} id={`notice-${n.id}`} className="glass scroll-mt-6 rounded-card p-6">
            <article>
              {n.priority === "important" && (
                <span className="mb-2 inline-block rounded-full bg-danger/12 px-2 py-0.5 text-caption font-semibold text-danger">
                  Important
                </span>
              )}
              <h2 className="text-title-2 font-bold">{n.title}</h2>
              <p className="mt-1 text-footnote text-ink-2">
                {n.author_name}
                {n.published_at && (
                  <>
                    {" · "}
                    <time dateTime={n.published_at} title={new Date(n.published_at).toLocaleString()}>
                      {relativeTime(n.published_at)}
                    </time>
                  </>
                )}
              </p>
              <p className="mt-3 whitespace-pre-line text-body">{n.body}</p>
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}
