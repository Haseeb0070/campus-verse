"use client";

import { usePathname } from "next/navigation";
import { ConversationList } from "@/components/chat/conversation-list";
import { useMe } from "@/lib/queries";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const inThread = pathname !== "/chat";
  const me = useMe().data;

  return (
    <div className="mx-auto flex h-[calc(100dvh-10rem)] max-w-6xl gap-5 md:h-[calc(100dvh-4rem)]">
      <aside
        aria-label="Conversations"
        className={`glass w-full shrink-0 overflow-y-auto rounded-card p-3 lg:block lg:w-80 ${
          inThread ? "hidden" : "block"
        }`}
      >
        <ConversationList myId={me?.id} />
      </aside>
      <div className={`min-w-0 flex-1 ${inThread ? "block" : "hidden lg:block"}`}>{children}</div>
    </div>
  );
}
