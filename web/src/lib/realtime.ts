"use client";

import { Centrifuge } from "centrifuge";
import { useEffect, useState } from "react";
import { ApiError, apiFetch } from "./api";

interface ConnectInfo {
  enabled: boolean;
  url: string;
  token: string;
}

let client: Centrifuge | null = null;
let starting: Promise<Centrifuge | null> | null = null;
/** True once the server said live updates are switched off. */
let off = false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One shared Centrifugo connection per tab, created on first use. Null if realtime is off (or
 * nobody is signed in). If the API can't be reached (asleep, or the network dropped), it keeps
 * trying with growing pauses instead of giving up, so chat goes live as soon as it can without
 * a reload.
 */
export function getRealtime(): Promise<Centrifuge | null> {
  if (client) return Promise.resolve(client);
  if (off) return Promise.resolve(null);
  starting ??= (async () => {
    for (let wait = 3000; ; wait = Math.min(wait * 2, 60_000)) {
      try {
        const info = await apiFetch<ConnectInfo>("/api/chat/realtime");
        if (!info.enabled) {
          off = true;
          return null;
        }
        client = new Centrifuge(info.url, {
          token: info.token,
          getToken: async () => (await apiFetch<ConnectInfo>("/api/chat/realtime")).token,
        });
        // The client retries on its own after a dropped connection, but stops for good after
        // some refusals (a token it doesn't accept, a server restart mid-deploy). Try again a
        // little later instead of staying offline until a reload.
        const c = client;
        c.on("disconnected", () => {
          setTimeout(() => {
            if (client === c && c.state === "disconnected") c.connect();
          }, 15_000);
        });
        c.connect();
        return c;
      } catch (err) {
        // Signed out or not allowed: trying again won't help.
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return null;
        await sleep(wait);
      }
    }
  })().finally(() => {
    starting = null;
  });
  return starting;
}

export function disconnectRealtime() {
  client?.disconnect();
  client = null;
}

/**
 * True while the live connection is up, false while it's down or still connecting (callers poll
 * meanwhile), and null when live updates are switched off on the server, so nothing should say
 * "reconnecting".
 */
export function useRealtimeConnected(): boolean | null {
  const [connected, setConnected] = useState<boolean | null>(off ? null : false);
  useEffect(() => {
    let cancelled = false;
    let detach = () => {};
    getRealtime().then((c) => {
      if (cancelled) return;
      if (!c) {
        if (off) setConnected(null);
        return;
      }
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
