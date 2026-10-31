"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EventForm } from "@/components/event-form";
import { ChevronLeftIcon } from "@/components/icons";
import { apiFetch, errorDetail } from "@/lib/api";
import { useEventAudiences } from "@/lib/events";
import type { CampusEvent } from "@/lib/events";

export default function NewEventPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const audiences = useEventAudiences();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header>
        <Link href="/calendar" className="inline-flex items-center gap-1 text-footnote font-semibold text-accent-ink">
          <ChevronLeftIcon className="size-4" /> Calendar
        </Link>
        <h1 className="mt-1 text-large-title font-bold">Add an event</h1>
      </header>
      {audiences.isSuccess && audiences.data.length === 0 ? (
        <div className="glass rounded-card p-6">
          <p className="text-headline font-semibold">You can&apos;t add events yet</p>
          <p className="mt-1 text-body text-ink-2">
            Teachers add events for the sections they teach. Ask your admin to add campus-wide ones.
          </p>
        </div>
      ) : (
        <EventForm
          submitLabel="Add event"
          onSubmit={async (payload) => {
            try {
              const made = await apiFetch<CampusEvent>("/api/events", { method: "POST", body: JSON.stringify(payload) });
              await queryClient.invalidateQueries({ queryKey: ["events"] });
              router.push(`/calendar/${made.id}`);
              return null;
            } catch (err) {
              return errorDetail(err, "Couldn't add the event. Try again.");
            }
          }}
        />
      )}
    </div>
  );
}
