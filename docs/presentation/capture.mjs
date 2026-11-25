// Takes the real screenshots the video is made of, from the app running locally.
//
//   node docs/presentation/capture.mjs [shot names...]
//
// Needs the web app on :3000 and a backend on API (default :8013, the copy of the local database
// that seed_video_data.py filled). SESSIONS is a file of "SESS <email> <sessionid>" lines made in
// the Django shell, so no password is typed anywhere. See README.md.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, sleep } from "./lib/cdp.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "shots");
const WEB = process.env.WEB ?? "http://localhost:3000";
const API = process.env.API ?? "http://127.0.0.1:8013";
const SESSIONS = process.env.SESSIONS ?? join(HERE, "sessions.txt");
const only = process.argv.slice(2);
const wanted = (name) => !only.length || only.includes(name);

const sessions = Object.fromEntries(
  readFileSync(SESSIONS, "utf8").trim().split("\n").map((l) => {
    const [, email, key] = l.trim().split(/\s+/);
    return [email.split("@")[0], key];
  }),
);

mkdirSync(OUT, { recursive: true });
const browser = await launch();
const meta = {};
let cookie = "";

// Things that are not part of the product: the in-app guide button and Next.js's dev badge.
const CLEAN = `aside[aria-label*="guide"], nextjs-portal { display: none !important; }
*, *::before, *::after { caret-color: transparent !important; }`;
// Finds the smallest visible element whose text starts with the given words.
const FIND = `window.T = (text, sel = "*") => {
  let best = null;
  for (const el of document.querySelectorAll(sel)) {
    const t = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim();
    if (!t.startsWith(text)) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (!best || r.width * r.height <= best.a) best = { el, a: r.width * r.height };
  }
  return best && best.el;
};`;

async function open({ width = 390, height = 844, scale = 2, mobile = true } = {}) {
  const p = await browser.page({ width, height, scale, mobile });
  // The browser asks Next.js for /api; answer from the video backend instead.
  await p.send("Fetch.enable", {
    patterns: [{ urlPattern: `${WEB}/api/*` }, { urlPattern: `${WEB}/_allauth/*` }],
  });
  p.on(async (m) => {
    if (m.method !== "Fetch.requestPaused") return;
    const { requestId, request } = m.params;
    try {
      const headers = { ...request.headers, cookie };
      delete headers.Cookie;
      const u = new URL(request.url);
      const r = await fetch(API + u.pathname + u.search, {
        method: request.method, headers, body: request.postData, redirect: "manual",
      });
      const body = Buffer.from(await r.arrayBuffer());
      const skip = ["content-encoding", "content-length", "transfer-encoding", "set-cookie"];
      const responseHeaders = [...r.headers]
        .filter(([k]) => !skip.includes(k))
        .map(([name, value]) => ({ name, value }));
      await p.send("Fetch.fulfillRequest", {
        requestId, responseCode: r.status, responseHeaders, body: body.toString("base64"),
      });
    } catch {
      await p.send("Fetch.failRequest", { requestId, errorReason: "Failed" }).catch(() => {});
    }
  });
  return p;
}

async function prepare(p) {
  await p.eval(`(() => { const s = document.createElement("style"); s.textContent = ${JSON.stringify(CLEAN)}; document.head.append(s); ${FIND} })()`);
}

/** Where the named things are on the page, in CSS pixels from the top of the picture. */
async function rects(p, targets) {
  const out = {};
  for (const [key, expr] of Object.entries(targets ?? {})) {
    const r = await p.eval(`(() => { const el = ${expr}; if (!el) return null; const r = el.getBoundingClientRect();
      return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; })()`);
    if (!r) console.warn("  target not found:", key);
    else out[key] = r;
  }
  return out;
}

/** One screen: the whole page as a tall picture (tab bar apart), or just what the phone shows. */
async function shot(p, name, { url, settle = 4500, full = true, targets, maxHeight = 3200, before } = {}) {
  if (!wanted(name)) return;
  if (url) await p.goto(typeof url === "function" ? await url() : url, settle);
  await prepare(p);
  if (before) { await p.eval(before); await sleep(1200); }
  const size = await p.eval(`({ w: innerWidth, h: innerHeight })`);
  const entry = { width: size.w, height: size.h };
  if (full) {
    const bar = await p.eval(`(() => { const n = document.querySelector('nav[aria-label="Tabs"]'); if (!n) return null; const r = n.getBoundingClientRect(); return { y: r.top, h: r.height }; })()`);
    if (bar) {
      writeFileSync(join(OUT, `${name}.tabs.png`), await p.shot({ clip: { x: 0, y: bar.y, width: size.w, height: bar.h, scale: 1 } }));
      entry.tabs = bar.h;
      await p.eval(`document.querySelector('nav[aria-label="Tabs"]').style.display = "none"`);
    }
    // Walk down the page once so everything that appears on scroll has appeared.
    await p.eval(`(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 500) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } scrollTo(0, 0); })()`);
    await sleep(700);
    const h = Math.min(maxHeight, await p.eval(`document.documentElement.scrollHeight`));
    entry.height = h;
    writeFileSync(join(OUT, `${name}.png`), await p.shot({ captureBeyondViewport: true, clip: { x: 0, y: 0, width: size.w, height: h, scale: 1 } }));
  } else {
    writeFileSync(join(OUT, `${name}.png`), await p.shot());
  }
  entry.targets = await rects(p, targets);
  meta[name] = entry;
  console.log("shot", name, entry.width + "x" + entry.height, Object.keys(entry.targets).join(" "));
}

const card = `closest("section,article,li,div[class*=rounded]")`;
const phone = await open();

/** The address of the first link on `list` whose text has `text` in it. */
const linkOn = (list, prefix, text) => async () => {
  await phone.goto(WEB + list, 4000);
  const href = await phone.eval(`[...document.querySelectorAll('a[href^="${prefix}"]')].find(a => a.innerText.includes(${JSON.stringify(text)}))?.getAttribute("href")`);
  return WEB + href;
};

// ---- Student ----
cookie = `sessionid=${sessions["126139"]}`;
await shot(phone, "today", {
  url: `${WEB}/today`,
  targets: {
    next: `T("Web Development")?.${card}`,
    room: `T("R-127", "span,div,p")`,
    chats: `T("Recent chats")?.${card}`,
    due: `T("Due soon")?.${card}`,
    notices: `[...document.querySelectorAll("h2,h3")].find(h => h.innerText.trim() === "Notices")?.${card}`,
  },
});
await shot(phone, "timetable", {
  url: `${WEB}/timetable`,
  targets: {
    room: `T("CC-310", "p,span,div")`,
    changed: `(T("Room changed") || T("R-27 ·") || T("Moved"))?.${card}`,
    friday: `T("Friday")`,
  },
});
await shot(phone, "chat", {
  url: linkOn("/chat", "/chat/", "EC-330"),
  full: false,
  before: `document.querySelectorAll("span").forEach(s => { if (s.innerText.includes("reconnecting")) s.textContent = ""; })`,
  targets: { reply: `T("Good topic")?.${card} || T("Good topic")`, box: `document.querySelector("textarea,input[type=text]")` },
});
await shot(phone, "chat-list", { url: `${WEB}/chat`, targets: { fresh: `T("New message", "a,button")`, first: `T("EC-330")?.closest("a,li")` } });
await shot(phone, "assignments", { url: `${WEB}/assignments`, targets: { open: `T("Project proposal")?.closest("a,li,article")` } });
await shot(phone, "assignment", {
  url: linkOn("/assignments", "/assignments/", "Project proposal"),
  targets: {
    upload: `T("Choose", "button,label") || T("Upload", "button,label") || T("Add", "button,label") || document.querySelector("input[type=file]")?.closest("label,div")`,
    submit: `T("Hand in", "button") || T("Submit", "button")`,
    due: `T("Due", "p,span,div")`,
  },
});
await shot(phone, "progress", {
  url: `${WEB}/progress`,
  targets: { marks: `T("Lab 2")?.closest("li,tr,div")`, attendance: `T("Attendance", "h3,h4,p,span,div")`, ai: `T("Artificial Intelligence")?.${card}`, automata: `T("Theory of Automata")?.${card}` },
});

// ---- Teacher ----
cookie = `sessionid=${sessions.nabeel}`;
await shot(phone, "notices", {
  url: `${WEB}/notices`,
  targets: { pinned: `T("Send your Web Development")?.${card}`, pin: `T("Pinned")`, fresh: `T("New notice", "a,button")` },
});
await shot(phone, "teacher-today", {
  url: `${WEB}/today`,
  targets: { next: `T("Web Development")?.${card}`, change: `T("Change", "button,a")`, attendance: `T("Attendance", "button,a")` },
});
await shot(phone, "teacher-timetable", {
  url: `${WEB}/timetable`,
  targets: { change: `T("Change", "button,a")`, attendance: `T("Attendance", "button,a")` },
});
await shot(phone, "change-class", {
  url: `${WEB}/timetable`,
  full: false,
  before: `(() => { const b = [...document.querySelectorAll("button")].filter(b => b.innerText.trim() === "Change"); b[b.length - 1].click(); })()`,
  targets: { dialog: `document.querySelector("[role=dialog],dialog[open]")`, late: `T("Running late")`, cancel: `T("Cancel", "button,label,div")`, move: `T("Move", "button,label,div")` },
});
await shot(phone, "attendance", {
  url: `${WEB}/attendance`, settle: 6000, maxHeight: 1700,
  targets: { all: `T("Mark everyone present", "button")`, rows: `T("Mark everyone present", "button")?.${card}` },
});

// ---- College office ----
cookie = `sessionid=${sessions.admin}`;
await shot(phone, "import", {
  url: `${WEB}/manage/import`,
  targets: { preview: `T("Preview import", "button")`, note: `T("Weekly classes")`, tabs: `T("Timetable", "button,a")?.parentElement` },
});
await shot(phone, "people", {
  url: `${WEB}/manage/people`, maxHeight: 1700,
  targets: { row: `T("126154@gcslahore.edu.pk")?.${card} || T("126154@gcslahore.edu.pk")`, invite: `T("Invite someone", "button,a")` },
});

// ---- Signed out ----
cookie = "";
await shot(phone, "sign-in", {
  url: `${WEB}/`,
  full: false,
  before: `T("Sign in", "button,a").click()`,
  targets: {
    email: `document.querySelector("[role=dialog] input, dialog input, input[type=email]")`,
    dialog: `document.querySelector("[role=dialog],dialog[open]")`,
    button: `[...document.querySelectorAll("[role=dialog] button, dialog button")].find(b => b.innerText.trim().startsWith("Sign in"))`,
  },
});
await phone.close();

// 1280 x 720 fills the 1920 x 1080 frame at 1.5; captured sharper than that so the camera can zoom in.
const desk = await open({ width: 1280, height: 720, scale: 2.25, mobile: false });
await shot(desk, "landing", {
  url: `${WEB}/`, full: false, settle: 5000,
  targets: { title: `document.querySelector("h1")`, signin: `T("Sign in", "a,button")` },
});
await desk.close();

const file = join(OUT, "shots.json");
const before = only.length && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
writeFileSync(file, JSON.stringify({ ...before, ...meta }, null, 1));
browser.close();
