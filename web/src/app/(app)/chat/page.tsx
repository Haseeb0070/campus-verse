"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { apiFetch, errorDetail } from "@/lib/api";
import type { Conversation } from "@/lib/types";

/** /chat?to=<person> (from search) opens, or starts, a private chat with that person. */
function OpenWith() {
  const to = useSearchParams().get("to");
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!to) return;
    apiFetch<Conversation>("/api/chat/direct", { method: "POST", body: JSON.stringify({ user_id: Number(to) }) })
      .then(async (conv) => {
        await qc.invalidateQueries({ queryKey: ["chat", "conversations"] });
        router.replace(`/chat/${conv.id}`);
      })
      .catch((err) => setError(errorDetail(err, "Couldn't open that chat.")));
  }, [to, router, qc]);

  if (to && !error) return <p className="text-body text-ink-2">Opening the chat…</p>;
  return (
    <div>
      {error && (
        <p role="alert" className="mb-2 text-body text-danger-ink">
          {error}
        </p>
      )}
      <p className="text-headline font-semibold">Pick a conversation</p>
      <p className="mt-1 text-body text-ink-2">
        Every subject you&apos;re in has its own chat. Use New message to write to a classmate,
        teacher or staff member one to one.
      </p>
    </div>
  );
}

export default function ChatIndex() {
  return (
    <div className="glass grid h-full place-items-center rounded-card p-6 text-center">
      <Suspense>
        <OpenWith />
      </Suspense>
    </div>
  );
}
