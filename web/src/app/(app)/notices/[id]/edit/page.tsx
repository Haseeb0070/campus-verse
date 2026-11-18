"use client";

import { useParams } from "next/navigation";
import { NoticeForm } from "@/components/notice-form";
import { useMyNotices } from "@/lib/queries";

/** Change one of your notices: the same form as a new one, filled in. */
export default function EditNoticePage() {
  const { id } = useParams<{ id: string }>();
  const mine = useMyNotices();
  if (mine.isPending) return <p className="text-body text-ink-2">Loading…</p>;
  const notice = mine.data?.find((n) => n.id === Number(id));
  if (!notice || notice.status === "archived") {
    return (
      <div className="glass mx-auto max-w-xl rounded-card p-6">
        <p className="text-headline font-semibold">You can&apos;t edit this notice</p>
        <p className="mt-1 text-body text-ink-2">Only its author can change it, and archived notices stay as they are.</p>
      </div>
    );
  }
  return <NoticeForm existing={notice} />;
}
