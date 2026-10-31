"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useAnchoredPopover } from "@/components/use-anchored-popover";
import { apiFetch, errorDetail } from "@/lib/api";
import type { ChatPerson, Conversation } from "@/lib/types";

/** "New message": search the people you're allowed to message, pick one, open the chat. */
export function NewMessageButton() {
  const id = useId();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pop = useAnchoredPopover<HTMLButtonElement, HTMLDivElement>(open, () => setOpen(false), {
    maxHeight: 420,
    minWidth: 300,
  });

  useEffect(() => {
    if (open) inputRef.current?.focus(); // after the popover takes focus
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 200);
    return () => clearTimeout(t);
  }, [q]);

  const people = useQuery({
    queryKey: ["chat", "people", debounced],
    queryFn: () => apiFetch<ChatPerson[]>(`/api/chat/people?q=${encodeURIComponent(debounced)}`),
    enabled: open,
  });
  const list = people.data ?? [];

  async function start(person: ChatPerson) {
    setError(null);
    try {
      const conv = await apiFetch<Conversation>("/api/chat/direct", {
        method: "POST",
        body: JSON.stringify({ user_id: person.id }),
      });
      await queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
      setOpen(false);
      setQ("");
      router.push(`/chat/${conv.id}`);
    } catch (err) {
      setError(errorDetail(err, "Couldn't start that chat."));
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(list.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && list[active]) {
      e.preventDefault();
      start(list[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      pop.anchorRef.current?.focus();
    }
  }

  return (
    <>
      <button
        ref={pop.anchorRef}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => !pop.justDismissed() && setOpen((o) => !o)}
        className="press h-9 rounded-full bg-accent px-3.5 text-footnote font-semibold text-on-accent"
      >
        New message
      </button>
      <div
        ref={pop.panelRef}
        id={`${id}-panel`}
        popover="auto"
        role="dialog"
        aria-label="New message"
        tabIndex={-1}
        onToggle={pop.onToggle}
        onKeyDown={onKey}
        style={pop.place}
        className="glass-thick menu-pop fixed inset-auto m-0 w-[320px] overflow-y-auto rounded-[18px] p-2 text-ink outline-none"
      >
        {open && (
          <>
            <label className="block p-1">
              <span className="sr-only">Search people</span>
              <input
                ref={inputRef}
                role="combobox"
                aria-expanded="true"
                aria-controls={`${id}-people`}
                aria-activedescendant={list[active] ? `${id}-p${list[active].id}` : undefined}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
                placeholder="Search classmates, teachers, staff"
                className="h-10 w-full rounded-control border border-transparent bg-fill px-3 text-body outline-none focus:border-accent"
              />
            </label>
            <ul id={`${id}-people`} role="listbox" aria-label="People" className="mt-1 flex flex-col">
              {list.map((p, i) => (
                <li key={p.id} id={`${id}-p${p.id}`} role="option" aria-selected={i === active}
                  onPointerMove={() => setActive(i)} onClick={() => start(p)}
                  className={`flex cursor-default items-center gap-3 rounded-[10px] p-2 ${
                    i === active ? "bg-accent text-on-accent" : ""}`}>
                  <span className={`grid size-8 shrink-0 place-items-center rounded-full text-caption font-semibold ${
                    i === active ? "bg-on-accent text-accent" : "bg-fill-strong"}`}>
                    {p.initials}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-body font-semibold">{p.name}</span>
                    <span className={`block text-footnote ${i === active ? "" : "text-ink-2"}`}>{p.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            {people.isSuccess && list.length === 0 && (
              <p className="p-3 text-footnote text-ink-2">
                {debounced ? "Nobody matches." : "You can message people you share a class with, and staff."}
              </p>
            )}
            {error && <p role="alert" className="p-2 text-footnote text-danger-ink">{error}</p>}
          </>
        )}
      </div>
    </>
  );
}
