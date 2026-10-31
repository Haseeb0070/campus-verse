"use client";

import { useEffect, useState } from "react";

type Status = "checking" | "online" | "offline";

const labels: Record<Status, string> = {
  checking: "Checking API…",
  online: "API connected",
  offline: "API offline",
};

const dots: Record<Status, string> = {
  checking: "bg-ink-3",
  online: "bg-success",
  offline: "bg-danger",
};

export function ApiStatus() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/health", { signal: controller.signal })
      .then((res) => setStatus(res.ok ? "online" : "offline"))
      .catch((err: unknown) => {
        if (!(err instanceof DOMException && err.name === "AbortError")) setStatus("offline");
      });
    return () => controller.abort();
  }, []);

  return (
    <span
      role="status"
      className="glass inline-flex h-9 items-center gap-2 rounded-full px-4 text-footnote font-semibold"
    >
      <span className={`size-2 rounded-full ${dots[status]}`} aria-hidden="true" />
      {labels[status]}
    </span>
  );
}
