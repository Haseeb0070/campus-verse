// A tiny Chrome DevTools Protocol client: starts headless Chrome and talks to it over a WebSocket.
// Needs Node 22+ (global WebSocket) and Google Chrome. No npm packages.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

export async function launch({ port = 9333, args = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "cv-chrome-"));
  const proc = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${dir}`,
      "--no-first-run",
      "--hide-scrollbars",
      "--force-color-profile=srgb",
      "--enable-unsafe-swiftshader",
      "--autoplay-policy=no-user-gesture-required",
      ...args,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  let info;
  for (let i = 0; i < 100 && !info; i++) {
    await new Promise((r) => setTimeout(r, 200));
    info = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).catch(() => null);
  }
  if (!info) throw new Error("Chrome did not start");
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const waiting = new Map();
  const listeners = new Set();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && waiting.has(msg.id)) {
      const { res, rej } = waiting.get(msg.id);
      waiting.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    } else for (const l of listeners) l(msg);
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((res, rej) => {
      waiting.set(++id, { res, rej });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });

  async function page({ width, height, scale = 1, mobile = false }) {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const s = (method, params) => send(method, params, sessionId);
    await s("Page.enable");
    await s("Runtime.enable");
    await s("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile });
    await s("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
    return {
      send: s,
      on(fn) {
        const l = (m) => { if (m.sessionId === sessionId) fn(m); };
        listeners.add(l);
        return () => listeners.delete(l);
      },
      async goto(url, settle = 1500) {
        const loaded = new Promise((res) => {
          const l = (m) => { if (m.sessionId === sessionId && m.method === "Page.loadEventFired") { listeners.delete(l); res(); } };
          listeners.add(l);
          setTimeout(() => { listeners.delete(l); res(); }, 30000);
        });
        await s("Page.navigate", { url });
        await loaded;
        await new Promise((r) => setTimeout(r, settle));
      },
      async eval(expression) {
        const r = await s("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
        return r.result.value;
      },
      async shot(opts = {}) {
        const { data } = await s("Page.captureScreenshot", { format: "png", ...opts });
        return Buffer.from(data, "base64");
      },
      close: () => send("Target.closeTarget", { targetId }),
    };
  }
  return { send, page, close: () => { try { ws.close(); } catch {} proc.kill(); } };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
