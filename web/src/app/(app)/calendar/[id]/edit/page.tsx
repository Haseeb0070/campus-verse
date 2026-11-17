"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { EventForm } from "@/components/event-form";
import { ChevronLeftIcon } from "@/components/icons";
import { apiFetch, errorDetail } from "@/lib/api";
import { useEvent } from "@/lib/events";
import type { CampusEvent } from "@/lib/events";
import { PageTitle } from "@/components/page-title";

export default function EditEventPage() {
  const id = Number(useParams<{ id: string }>().id);
  const router = useRouter();
  const queryClient = useQueryClient();
  const event = useEvent(id);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header>
        <Link href={`/calendar/${id}`} className="inline-flex items-center gap-1 text-footnote font-semibold text-accent-ink">
          <ChevronLeftIcon className="size-4" /> Back to the event
        </Link>
        <PageTitle className="mt-1 text-large-title font-bold" text="Edit event" />
      </header>
      {event.isPending && <p className="text-body text-ink-2">Loading…</p>}
      {event.data && !event.data.can_manage && (
        <p className="glass rounded-card p-6 text-body">Only the organiser can edit this event.</p>
      )}
      {event.data?.can_manage && (
        <EventForm
          initial={event.data}
          submitLabel="Save changes"
          onSubmit={async (payload) => {
            try {
              const saved = await apiFetch<CampusEvent>(`/api/events/${id}`, { method: "PUT", body: JSON.stringify(payload) });
              queryClient.setQueryData(["events", "one", id], saved);
              await queryClient.invalidateQueries({ queryKey: ["events"] });
              router.push(`/calendar/${id}`);
              return null;
            } catch (err) {
              return errorDetail(err, "Couldn't save. Try again.");
            }
          }}
        />
      )}
    </div>
  );
}
