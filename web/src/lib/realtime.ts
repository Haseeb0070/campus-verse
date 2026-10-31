"use client";

import { Centrifuge } from "centrifuge";
import { useEffect, useState } from "react";
import { apiFetch } from "./api";

interface ConnectInfo {
  enabled: boolean;
  url: string;
  token: string;
}

let client: Centrifuge | null = null;
let starting: Promise<Centrifuge | null> | null = null;

/** One shared Centrifugo connection per tab, created on first use. Null if realtime is off. */
export function getRealtime(): Promise<Centrifuge | null> {
  if (client) return Promise.resolve(client);
  starting ??= apiFetch<ConnectInfo>("/api/chat/realtime")
    .then((info) => {
      if (!info.enabled) return null;
      client = new Centrifuge(info.url, {
        token: info.token,
        getToken: async () => (await apiFetch<ConnectInfo>("/api/chat/realtime")).token,
      });
      client.connect();
      return client;
    })
    .catch(() => null)
    .finally(() => {
      starting = null;
    });
  return starting;
}

export function disconnectRealtime() {
  client?.disconnect();
  client = null;
}

/** True while the live connection is up; callers fall back to polling otherwise. */
export function useRealtimeConnected() {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let detach = () => {};
    getRealtime().then((c) => {
      if (!c || cancelled) return;
      const onUp = () => setConnected(true);
      const onDown = () => setConnected(false);
      c.on("connected", onUp);
      c.on("disconnected", onDown);
      c.on("connecting", onDown);
      setConnected(c.state === "connected");
      detach = () => {
        c.removeListener("connected", onUp);
        c.removeListener("disconnected", onDown);
        c.removeListener("connecting", onDown);
      };
    });
    return () => {
      cancelled = true;
      detach();
    };
  }, []);
  return connected;
}
