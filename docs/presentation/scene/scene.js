// The whole film as one function of time: setFrame(t, verse) lays out every element for second t.
// Nothing here uses timers or CSS animation, so a frame always looks the same however it is reached.
// `verse` is one drawn frame of the guide, made by render.mjs with @bible-strong/avatar-core.

const script = await (await fetch("/script.json")).json();
const shots = await (await fetch("/shots/shots.json")).json();
// When each line is spoken (made by fit.mjs). Without it the film is silent and words keep their own pace.
const voice = await fetch("/audio/voice.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));

const $ = (id) => document.getElementById(id);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t, from, length) => clamp((t - from) / length);
const lerp = (a, b, x) => a + (b - a) * x;
const inOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const out = (x) => 1 - Math.pow(1 - x, 3);
const back = (x) => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);

const COLOURS = {
  navy: { bg: "#192840", fg: "#fffaf2", tone: "dark" },
  blue: { bg: "#2f6fae", fg: "#fffaf2", tone: "dark" },
  cream: { bg: "#eef2f6", fg: "#192840", tone: "light" },
};
const scenes = script.scenes;
const sceneAt = (t) => scenes.findLast((s) => t >= s.start) ?? scenes[0];
const HOOK = scenes[0];
const END = scenes[scenes.length - 1];
const phoneScenes = scenes.filter((s) => s !== HOOK && s !== END);

// ---------- The phone ----------
const SCREEN = { w: 390, h: 844 };
const K = 940 / SCREEN.h; // stage pixels per app pixel when the camera is at rest
const ANCHOR = { x: 1430, y: 540 }; // where the camera's focus point sits on the stage
const MOVE = 0.75; // seconds the camera takes to reach a beat

/** A beat with its numbers worked out: how far the page is scrolled, and what the camera looks at. */
function resolve(beat) {
  const shot = shots[beat.shot];
  const view = SCREEN.h - (shot.tabs ?? 0);
  const maxScroll = Math.max(0, shot.height - view);
  const centre = { x: SCREEN.w / 2, y: SCREEN.h / 2 };
  if (!beat.target) return { ...beat, scroll: 0, zoom: 1, focus: centre, rect: null };
  const r = shot.targets[beat.target];
  if (!r) throw new Error(`No target "${beat.target}" on shot "${beat.shot}"`);
  // "grow" widens the frame past the element itself: [top, right, bottom, left] in app pixels.
  const [gt, gr, gb, gl] = beat.grow ?? [0, 0, 0, 0];
  const h = Math.min(r.h + gt + gb, view - 130);
  const scroll = clamp(r.y - gt + h / 2 - view * 0.46, 0, maxScroll);
  const rect = { x: r.x - gl, y: r.y - gt - scroll, w: r.w + gl + gr, h };
  const zoom = beat.zoom ?? 1.4;
  // Look at the thing, but never so far off-centre that the screen's edge comes into the middle.
  const reach = (size) => size / 2 - size / (2 * zoom) + 26 / zoom;
  const focus = {
    x: clamp(rect.x + rect.w / 2, centre.x - reach(SCREEN.w), centre.x + reach(SCREEN.w)),
    y: clamp(rect.y + rect.h / 2, centre.y - reach(SCREEN.h), centre.y + reach(SCREEN.h)),
  };
  return { ...beat, scroll, zoom, focus, rect };
}
const beats = script.beats.map(resolve);

const layers = {};
for (const name of new Set(beats.map((b) => b.shot))) {
  const el = document.createElement("div");
  el.className = "layer";
  const page = new Image();
  page.className = "page";
  page.src = `/shots/${name}.png`;
  el.append(page);
  if (shots[name].tabs) {
    const tabs = new Image();
    tabs.className = "tabs";
    tabs.src = `/shots/${name}.tabs.png`;
    el.append(tabs);
  }
  $("layers").append(el);
  layers[name] = { el, page };
}

function drawPhone(t) {
  const phone = $("phone");
  const first = beats[0].t;
  const enter = back(seg(t, first - 0.35, 0.7));
  const leave = inOut(seg(t, END.start - 0.1, 0.55));
  if (t < first - 0.35 || leave >= 1) {
    phone.style.display = $("label").style.display = "none";
    return;
  }
  phone.style.display = "block";

  const i = beats.findLastIndex((b) => t >= b.t);
  const cur = beats[Math.max(i, 0)];
  const prev = beats[i - 1] ?? cur;
  const next = beats[i + 1];
  const p = inOut(seg(t, cur.t, MOVE));
  const zoom = lerp(prev.zoom, cur.zoom, p);
  const fx = lerp(prev.focus.x, cur.focus.x, p);
  const fy = lerp(prev.focus.y, cur.focus.y, p);
  const scale = K * zoom;
  const ox = ANCHOR.x - fx * scale + (1 - enter) * 1100 + leave * 1300;
  const oy = ANCHOR.y - fy * scale;
  phone.style.transform = `translate(${ox}px, ${oy}px) scale(${scale})`;

  // The pages: one scrolls, or a new one pushes the old one out.
  const swap = cur.shot !== prev.shot;
  const q = swap ? inOut(seg(t, cur.t, 0.45)) : 1;
  for (const [name, layer] of Object.entries(layers)) {
    const isCur = name === cur.shot;
    const isPrev = swap && name === prev.shot && q < 1;
    layer.el.style.display = isCur || isPrev ? "block" : "none";
    if (isCur) {
      const scroll = swap ? cur.scroll : lerp(prev.scroll, cur.scroll, p);
      layer.page.style.transform = `translateY(${-scroll}px)`;
      layer.el.style.transform = `translateX(${(1 - q) * 100}%)`;
      layer.el.style.zIndex = 2;
      layer.el.style.opacity = 1;
    } else if (isPrev) {
      layer.page.style.transform = `translateY(${-prev.scroll}px)`;
      layer.el.style.transform = `translateX(${-q * 30}%)`;
      layer.el.style.zIndex = 1;
      layer.el.style.opacity = 1 - q * 0.5;
    }
  }

  // The glowing frame around what Verse is talking about, the pointer on it, and its name.
  const glow = $("glow"), pointer = $("pointer"), ripple = $("ripple"), label = $("label");
  const shown = cur.rect
    ? seg(t, cur.t + MOVE - 0.2, 0.3) * (1 - seg(t, (next?.t ?? END.start) - 0.18, 0.18))
    : 0;
  const px = 1 / scale; // one stage pixel, in app pixels
  if (shown > 0) {
    const r = cur.rect;
    const pad = 7 + (1 - out(shown)) * 14;
    const beat = 0.5 + 0.5 * Math.sin((t - cur.t) * 5.2);
    Object.assign(glow.style, {
      display: "block", opacity: shown,
      left: `${r.x - pad}px`, top: `${r.y - pad}px`, width: `${r.w + pad * 2}px`, height: `${r.h + pad * 2}px`,
      borderWidth: `${4 * px}px`, borderRadius: `${Math.min(26, r.h / 2 + pad)}px`,
      boxShadow: `0 0 0 ${(5 + beat * 7) * px}px rgb(227 163 59 / ${0.3 - beat * 0.12}), 0 0 ${(26 + beat * 30) * px}px ${6 * px}px rgb(227 163 59 / 0.75), 0 0 0 2400px rgb(16 26 44 / ${0.3 * shown})`,
    });
    const tip = { x: Math.min(r.x + r.w * 0.8, SCREEN.w - 30), y: r.y + Math.min(r.h * 0.72, r.h - 8) };
    const size = 34 * px;
    const press = 1 - 0.22 * Math.sin(Math.PI * seg(t, cur.t + MOVE + 0.1, 0.3));
    Object.assign(pointer.style, {
      display: "block", opacity: shown, width: `${size}px`, height: `${size}px`, borderWidth: `${4 * px}px`,
      left: `${tip.x - size / 2}px`, top: `${tip.y - size / 2}px`, transform: `scale(${press})`,
    });
    const wave = seg(t, cur.t + MOVE + 0.2, 0.65);
    const wsize = size * (1 + wave * 2.6);
    Object.assign(ripple.style, {
      display: wave > 0 && wave < 1 ? "block" : "none", opacity: 1 - wave, borderWidth: `${3 * px}px`,
      width: `${wsize}px`, height: `${wsize}px`, left: `${tip.x - wsize / 2}px`, top: `${tip.y - wsize / 2}px`,
    });
  } else {
    glow.style.display = pointer.style.display = ripple.style.display = "none";
  }

  if (shown > 0 && cur.label) {
    const r = cur.rect;
    if (label.textContent !== cur.label) label.textContent = cur.label;
    const pop = back(seg(t, cur.t + MOVE - 0.1, 0.4));
    const x = ox + (r.x - 4) * scale;
    const above = oy + (r.y - 10) * scale - 78;
    const y = above > 40 && cur.labelAt !== "below" ? above : oy + (r.y + r.h + 10) * scale + 22;
    Object.assign(label.style, {
      display: "block", opacity: shown, left: `${clamp(x, 960, 1890 - label.offsetWidth)}px`, top: `${y}px`,
      transform: `scale(${0.6 + 0.4 * pop})`, transformOrigin: y > above ? "0 0" : "0 100%",
    });
  } else {
    label.style.display = "none";
  }
}

// ---------- Background ----------
const landing = $("landing").firstElementChild;
const LAND = 1920 / shots.landing.width; // the landing picture's CSS pixels to stage pixels
const headline = shots.landing.targets.title;
const HEAD = { x: (headline.x + headline.w / 2) * LAND, y: (headline.y + headline.h / 2) * LAND + 40 };
const landingZoom = (t) => 1.12 + 0.3 * out(seg(t, 0, HOOK.end + 0.6));
/** Where a point of the landing picture is on the stage, with the camera pushed in. */
const onLanding = (x, y, t) => {
  const z = landingZoom(t);
  return { x: 960 + (x - HEAD.x) * z, y: 400 + (y - HEAD.y) * z };
};

function drawBackground(t) {
  const s = sceneAt(t);
  const i = scenes.indexOf(s);
  const colour = COLOURS[s.bg ?? "navy"];
  const before = COLOURS[scenes[i - 1]?.bg ?? "navy"];
  const wipe = i > 0 ? inOut(seg(t, s.start - 0.05, 0.6)) : 1;
  $("bgA").style.background = wipe < 1 ? before.bg : colour.bg;
  const b = $("bgB");
  b.style.display = wipe < 1 ? "block" : "none";
  b.style.background = colour.bg;
  b.style.clipPath = `circle(${wipe * 2300}px at 185px 900px)`;

  const stage = $("stage");
  const tone = wipe > 0.45 ? colour : before;
  stage.className = tone.tone;
  stage.style.color = tone.fg;

  const showLanding = t < HOOK.end + 0.6;
  $("landing").style.display = showLanding ? "block" : "none";
  if (showLanding) {
    const z = landingZoom(t);
    landing.style.transform = `translate(${960 - HEAD.x * z}px, ${400 - HEAD.y * z}px) scale(${z})`;
  }

  // Shapes drift slowly; they stay out of the hook, where the landing page fills the frame.
  const fade = seg(t, HOOK.end + 0.2, 0.5);
  const place = (id, x, y, turn = 0) =>
    Object.assign($(id).style, { opacity: fade, transform: `translate(${x}px, ${y}px) rotate(${turn}deg)` });
  place("ring", 1330 + Math.sin(t * 0.21) * 40, -330 + Math.cos(t * 0.17) * 30);
  place("dot", 820 + Math.cos(t * 0.26) * 46, 560 + Math.sin(t * 0.31) * 38);
  place("tile", 1640 + Math.sin(t * 0.19 + 1) * 30, 800 + Math.cos(t * 0.23) * 34, 18 + t * 1.2);
}

// ---------- Words ----------
const words = (el, text) => {
  el.replaceChildren(...text.split(" ").map((w, i, all) => {
    const span = document.createElement("span");
    span.textContent = w + (i < all.length - 1 ? " " : "");
    return span;
  }));
};

$("steps").replaceChildren(...phoneScenes.map(() => {
  const i = document.createElement("i");
  i.append(document.createElement("b"));
  return i;
}));

let copyOf = null;
function drawCopy(t) {
  const s = sceneAt(t);
  const copy = $("copy"), steps = $("steps"), brand = $("brand");
  const inPhone = phoneScenes.includes(s);
  const chrome = seg(t, phoneScenes[0].start + 0.3, 0.4) * (1 - seg(t, END.start - 0.25, 0.25));
  steps.style.opacity = brand.style.opacity = chrome;
  [...steps.children].forEach((bar, i) => {
    const sc = phoneScenes[i];
    bar.firstElementChild.style.transform = `scaleX(${seg(t, sc.start, sc.end - sc.start)})`;
  });
  if (!inPhone) { copy.style.display = "none"; return; }
  copy.style.display = "block";
  if (copyOf !== s) {
    copyOf = s;
    $("kicker").textContent = s.kicker;
    words($("title"), s.title);
  }
  const gone = seg(t, s.end - 0.22, 0.22);
  const a = out(seg(t, s.start + 0.22, 0.45));
  Object.assign($("kicker").style, { opacity: a * (1 - gone), transform: `translateY(${(1 - a) * 26 - gone * 20}px)` });
  [...$("title").children].forEach((w, i) => {
    const b = out(seg(t, s.start + 0.3 + i * 0.07, 0.5));
    Object.assign(w.style, { opacity: b * (1 - gone), transform: `translateY(${(1 - b) * 54 - gone * 24}px)` });
  });
}

let bubbleOf = null;
function drawBubble(t, at) {
  const s = sceneAt(t);
  const bubble = $("bubble");
  if (bubbleOf !== s) {
    bubbleOf = s;
    words(bubble, s.line);
  }
  const length = s.end - s.start;
  const pop = back(seg(t, s.start + (s === HOOK ? 0.9 : 0.3), 0.4));
  const gone = s === END ? 0 : seg(t, s.end - 0.2, 0.2);
  // Each word lights up as Verse gets to it, and the line is finished before the scene is.
  const said = voice[s.id];
  const from = s.start + (said ? said.lead : s === HOOK ? 1.1 : 0.5);
  // The end card's bubble holds only the last words of what is said there.
  const span = said ? said.seconds * (s === END ? 0.35 : 0.97) : Math.max(0.6, length - 2.3);
  const begin = said && s === END ? from + said.seconds * 0.6 : from;
  const letters = [...bubble.children].map((w) => w.textContent.length);
  const all = letters.reduce((a, b) => a + b, 0);
  let before = 0;
  [...bubble.children].forEach((w, i) => {
    w.style.opacity = lerp(0.4, 1, seg(t, begin + (before / all) * span - 0.05, 0.14));
    before += letters[i];
  });
  const base = { opacity: (pop > 0.001 ? 1 : 0) * (1 - gone), transform: `scale(${0.7 + 0.3 * pop})` };
  if (s === HOOK) {
    bubble.className = "up";
    Object.assign(bubble.style, base, { left: "430px", top: "", bottom: "70px", width: "1060px", fontSize: "38px", transformOrigin: "50% 0" });
  } else if (s === END) {
    bubble.className = "side";
    Object.assign(bubble.style, base, { left: `${at.x + at.size / 2 + 34}px`, top: `${at.y - 52}px`, bottom: "", width: "", fontSize: "46px", transformOrigin: "0 50%" });
  } else {
    bubble.className = "left";
    Object.assign(bubble.style, base, { left: "318px", top: "", bottom: "74px", width: "640px", fontSize: "33px", transformOrigin: "0 100%" });
  }
}

function drawEnd(t) {
  const end = $("end");
  if (t < END.start) { end.style.display = "none"; return; }
  end.style.display = "block";
  $("wordmark").textContent ||= END.wordmark;
  $("tagline").textContent ||= END.tagline;
  $("url").firstElementChild.textContent ||= END.url;
  [["wordmark", 0.45], ["tagline", 0.7], ["url", 0.95]].forEach(([id, delay]) => {
    const a = out(seg(t, END.start + delay, 0.5));
    Object.assign($(id).style, { opacity: a, transform: `translateY(${(1 - a) * 46}px)` });
  });
}

// ---------- Verse ----------
const NS = "http://www.w3.org/2000/svg";
const PARTS = 5; // the body's three extra pieces (cap, board, tassel) and two more the renderer keeps
const MARKS = 12;
function buildVerse() {
  const el = (name, attrs = {}, children = []) => {
    const node = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    node.append(...children);
    return node;
  };
  const part = (name, attrs = {}) => el("path", { "data-part": name, ...attrs });
  const each = (make) => Array.from({ length: PARTS }, (_, i) => make(i));
  const svg = el("svg", { viewBox: "-150 -150 300 300" }, [
    el("defs", {}, [
      el("clipPath", { id: "v-head" }, [part("head-clip")]),
      ...each((i) => el("clipPath", { id: `v-front-${i}` }, [part(`front-clip-${i}`)])),
    ]),
    ...Array.from({ length: MARKS }, (_, i) => part(`mark-${i}`, { "stroke-linecap": "round", "stroke-linejoin": "round" })),
    el("g", { "data-part": "body" }, [
      el("g", { "data-part": "outline", fill: "none", "stroke-linejoin": "round" }, [
        ...each((i) => part(`outline-back-${i}`)), part("outline-head"), ...each((i) => part(`outline-front-${i}`)),
      ]),
      el("g", { "data-part": "back" }, each((i) => part(`back-${i}`))),
      part("head"),
      el("g", { "data-part": "face", "clip-path": "url(#v-head)" }, [part("left"), part("right"), part("nose"), part("mouth")]),
      el("g", { "data-part": "front" }, each((i) => part(`front-${i}`))),
      part("disc"),
    ]),
  ]);
  $("verse").append(svg);
  return svg;
}
const verseSvg = buildVerse();

/** Writes one frame of the avatar on the SVG, the way @bible-strong/avatar-react does. */
function paintVerse(frame) {
  const set = (name, attr, value) => verseSvg.querySelector(`[data-part="${name}"]`)?.setAttribute(attr, value);
  const { geometry: g, colors, bodyColors, transform, spinner, outline } = frame;
  const round = spinner?.round ?? 0;
  const solid = String(1 - round);
  set("body", "transform", `matrix(${transform.join(" ")})`);
  set("body", "opacity", String(frame.opacity));
  set("head", "d", g.headPath);
  set("head", "fill", colors.body);
  set("head", "visibility", round >= 0.999 ? "hidden" : "visible");
  set("head-clip", "d", g.headPath);
  set("left", "d", g.leftVisible ? g.leftPath : "");
  set("right", "d", g.rightVisible ? g.rightPath : "");
  set("nose", "d", g.nosePath);
  set("mouth", "d", g.mouthPath);
  set("face", "fill", colors.eyes);
  for (const name of ["face", "back", "front"]) set(name, "opacity", solid);
  if (outline) {
    set("outline", "stroke", outline.color);
    set("outline", "stroke-width", String(outline.width * 2));
    set("outline", "opacity", String(outline.opacity * (1 - round)));
    set("outline-head", "d", round >= 0.999 ? "" : g.headPath);
  }
  for (let i = 0; i < PARTS; i++) {
    set(`outline-back-${i}`, "d", outline ? g.backPaths[i] ?? "" : "");
    set(`outline-front-${i}`, "d", outline ? g.frontPaths[i] ?? "" : "");
    set(`back-${i}`, "d", g.backPaths[i] ?? "");
    set(`back-${i}`, "fill", bodyColors.back[i] ?? colors.body);
    set(`front-${i}`, "d", g.frontPaths[i] ?? "");
    set(`front-${i}`, "fill", bodyColors.front[i] ?? colors.body);
    const clip = g.frontClipPaths[i] ?? "";
    set(`front-clip-${i}`, "d", clip);
    const front = verseSvg.querySelector(`[data-part="front-${i}"]`);
    clip ? front.setAttribute("clip-path", `url(#v-front-${i})`) : front.removeAttribute("clip-path");
  }
  set("disc", "d", spinner && round > 0 ? spinner.disc : "");
  set("disc", "fill", colors.body);
  set("disc", "opacity", String(round));
  for (let i = 0; i < MARKS; i++) {
    const mark = spinner?.marks[i];
    const node = verseSvg.querySelector(`[data-part="mark-${i}"]`);
    node.setAttribute("d", mark?.d ?? "");
    node.setAttribute("opacity", String(mark?.opacity ?? 0));
    node.setAttribute("fill", mark && mark.strokeWidth === undefined ? colors.body : "none");
    node.setAttribute("stroke", mark && mark.strokeWidth !== undefined ? colors.body : "none");
    if (mark?.strokeWidth !== undefined) node.setAttribute("stroke-width", String(mark.strokeWidth));
  }
}

/** Where Verse stands: beside the headline, then in its corner, then in the middle of the last card. */
function versePlace(t) {
  const beside = onLanding((headline.x + headline.w) * LAND + 150, (headline.y + headline.h / 2) * LAND, t);
  const hook = { ...beside, size: 250 };
  const corner = { x: 186, y: 884, size: 216 };
  const centre = { x: 790, y: 290, size: 300 };
  const a = inOut(seg(t, HOOK.end - 0.35, 0.7));
  const b = inOut(seg(t, END.start - 0.1, 0.7));
  const mix = (p, q, x) => ({ x: lerp(p.x, q.x, x), y: lerp(p.y, q.y, x) - Math.sin(Math.PI * x) * 120, size: lerp(p.size, q.size, x) });
  return b > 0 ? mix(corner, centre, b) : mix(hook, corner, a);
}

function drawVerse(t, frame) {
  if (frame) paintVerse(frame);
  const at = versePlace(t);
  const pop = back(seg(t, 0.45, 0.5));
  const verse = $("verse");
  Object.assign(verse.style, {
    width: `${at.size}px`, height: `${at.size}px`, opacity: pop > 0.001 ? 1 : 0,
    transform: `translate(${at.x - at.size / 2}px, ${at.y - at.size / 2}px) scale(${pop})`,
  });
  const grounded = seg(t, HOOK.end + 0.4, 0.3) * (1 - seg(t, END.start - 0.1, 0.2)) + seg(t, END.start + 0.7, 0.3);
  Object.assign($("shadow").style, {
    opacity: grounded, width: `${at.size * 0.7}px`,
    transform: `translate(${at.x - at.size * 0.35}px, ${at.y + at.size * 0.47}px)`,
  });
  return at;
}

window.setFrame = (t, verse) => {
  drawBackground(t);
  drawCopy(t);
  drawPhone(t);
  drawEnd(t);
  drawBubble(t, drawVerse(t, verse));
};

await Promise.all([
  document.fonts.load('600 20px "Plus Jakarta Sans Variable"'),
  document.fonts.load('600 20px "Newsreader Variable"'),
  ...[...document.images].map((img) => img.decode().catch(() => {})),
]);
window.setFrame(0, null);
window.film = { fps: script.fps, duration: script.duration };
