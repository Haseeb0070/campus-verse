// Renders the presentation film to an MP4, with nothing to install beyond Node 22 and Chrome.
//
//   node docs/presentation/render.mjs                    the whole film -> campusverse.mp4
//   node docs/presentation/render.mjs --stills 3,10,25   single frames (PNG) at those seconds
//   node docs/presentation/render.mjs --serve            just serve the scene, to open in a browser
//
// How: headless Chrome draws scene/index.html one frame at a time (the scene is a pure function
// of time), each frame is screenshotted, and a second tab encodes the pictures to H.264 with
// Chrome's own VideoEncoder. The MP4 file around that video is written here, by hand.
import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launch } from "./lib/cdp.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "..", "..", "web");
const W = 1920, H = 1080;
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1] ?? true; };
const OUT = flag("--out") ?? join(HERE, "campusverse.mp4");

// ---------- A tiny static server: the scene, the shots, and the site's own fonts ----------
const FONTS = {
  "/fonts/plus-jakarta-sans.woff2": "@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2",
  "/fonts/newsreader.woff2": "@fontsource-variable/newsreader/files/newsreader-latin-wght-normal.woff2",
};
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2" };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file;
  if (FONTS[path]) file = join(WEB, "node_modules", FONTS[path]);
  else if (path.startsWith("/shots/")) file = join(HERE, normalize(path));
  else file = join(HERE, "scene", normalize(path === "/" ? "/index.html" : path));
  if (!file.startsWith(HERE) && !FONTS[path] || !existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(Number(flag("--port") ?? 4173), "127.0.0.1", r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
if (flag("--serve")) {
  console.log(`Scene at ${ORIGIN} - in the console: setFrame(seconds, null)`);
  await new Promise(() => {});
}

// ---------- Verse: the same character and engine the site uses, stepped one frame at a time ----------
const core = await import(pathToFileURL(join(WEB, "node_modules/@bible-strong/avatar-core/dist/index.js")));
const script = JSON.parse(readFileSync(join(HERE, "scene", "script.json"), "utf8"));
const file = JSON.parse(readFileSync(join(WEB, "src/components/landing/guide.avatar.json"), "utf8"));
const GUIDE = { body: "#2f6fae", cap: "#192840", tassel: "#e3a33b" }; // Campus Blue, from web/src/lib/theme.ts
const [base, board, tassel] = file.body.nodes;
const character = core.characterOf({
  ...file,
  colors: { ...file.colors, body: GUIDE.body },
  body: { ...file.body, nodes: [{ ...base, color: GUIDE.cap }, { ...board, color: GUIDE.cap }, { ...tassel, color: GUIDE.tassel }] },
});
const outline = character.style?.outline?.enabled ? character.style.outline : null;

/** Every frame of Verse for the film: its mood follows the scene, and it looks at what it shows. */
function verseFrames(fps, duration) {
  const engine = core.createAvatarEngine({ seed: core.seedOfName("Verse"), compact: false });
  const frames = [];
  let scene = null, looking = null;
  const last = script.scenes[script.scenes.length - 1];
  for (let i = 0; i < Math.round(duration * fps); i++) {
    const t = i / fps;
    const now = script.scenes.findLast((s) => t >= s.start);
    if (now !== scene) {
      scene = now;
      core.setEngineState(engine, now.verse);
      core.pokeEngine(engine, "bounce");
    }
    // Towards the headline in the hook, towards the phone while a beat is being pointed at.
    const beat = script.beats.findLast((b) => t >= b.t);
    const look = t < 0.9 ? null
      : t < script.scenes[0].end - 0.5 ? "-0.75,0.05"
      : beat?.target && t < last.start && t - beat.t > 0.15 && t - beat.t < 1.9 ? "0.85,0.2"
      : null;
    if (look !== looking) {
      looking = look;
      core.setEngineLookAt(engine, look ? look.split(",").map(Number) : null);
    }
    core.advanceEngine(engine, 1 / fps);
    frames.push({ ...core.renderCharacterFrame(character, core.engineFrame(engine)), outline });
  }
  return frames;
}

// ---------- MP4 ----------
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };
const box = (type, ...parts) => {
  const body = Buffer.concat(parts);
  return Buffer.concat([u32(body.length + 8), Buffer.from(type, "latin1"), body]);
};
const full = (type, version, flags, ...parts) => box(type, Buffer.from([version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255]), ...parts);
const MATRIX = Buffer.concat([0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000].map(u32));

/** An MP4 holding one H.264 video track: `samples` are AVCC frames in order, at a constant rate. */
function mp4({ samples, avcC, fps, width, height }) {
  const scale = fps * 1000, delta = 1000, duration = samples.length * delta;
  const ftyp = box("ftyp", Buffer.from("isom"), u32(512), Buffer.from("isomiso2avc1mp41"));
  const moov = (firstByte) => {
    const stsd = full("stsd", 0, 0, u32(1), box("avc1",
      Buffer.alloc(6), u16(1), Buffer.alloc(16), u16(width), u16(height), u32(0x480000), u32(0x480000), u32(0), u16(1),
      Buffer.alloc(32), u16(24), u16(0xffff), box("avcC", avcC),
      box("colr", Buffer.from("nclx"), u16(1), u16(1), u16(1), Buffer.from([0])),
    ));
    const keys = samples.flatMap((s, i) => (s.key ? [i + 1] : []));
    let at = firstByte;
    const offsets = samples.map((s) => { const here = at; at += s.data.length; return here; });
    const stbl = box("stbl", stsd,
      full("stts", 0, 0, u32(1), u32(samples.length), u32(delta)),
      full("stss", 0, 0, u32(keys.length), ...keys.map(u32)),
      full("stsc", 0, 0, u32(1), u32(1), u32(1), u32(1)),
      full("stsz", 0, 0, u32(0), u32(samples.length), ...samples.map((s) => u32(s.data.length))),
      full("stco", 0, 0, u32(samples.length), ...offsets.map(u32)),
    );
    const minf = box("minf", full("vmhd", 0, 1, Buffer.alloc(8)),
      box("dinf", full("dref", 0, 0, u32(1), full("url ", 0, 1))), stbl);
    const mdia = box("mdia",
      full("mdhd", 0, 0, u32(0), u32(0), u32(scale), u32(duration), u16(0x55c4), u16(0)),
      full("hdlr", 0, 0, u32(0), Buffer.from("vide"), Buffer.alloc(12), Buffer.from("VideoHandler\0")),
      minf);
    const trak = box("trak",
      full("tkhd", 0, 3, u32(0), u32(0), u32(1), u32(0), u32(duration), Buffer.alloc(8), u16(0), u16(0), u16(0), u16(0), MATRIX, u32(width << 16), u32(height << 16)),
      mdia);
    return box("moov",
      full("mvhd", 0, 0, u32(0), u32(0), u32(scale), u32(duration), u32(0x10000), u16(0x100), Buffer.alloc(10), MATRIX, Buffer.alloc(24), u32(2)),
      trak);
  };
  // The index goes before the video so the file starts playing at once; its size doesn't depend
  // on where the video starts, so build it once to measure and once for real.
  const start = ftyp.length + moov(0).length + 8;
  return Buffer.concat([ftyp, moov(start), box("mdat", ...samples.map((s) => s.data))]);
}

// ---------- Render ----------
const browser = await launch({ port: 9335 });
const page = await browser.page({ width: W, height: H, scale: 1 });
await page.goto(`${ORIGIN}/`, 500);
const film = await page.eval(`new Promise(async (res) => { while (!window.film) await new Promise(r => setTimeout(r, 50)); res(window.film); })`);
const verse = verseFrames(film.fps, film.duration);
const draw = (i) => page.eval(`setFrame(${i / film.fps}, ${JSON.stringify(verse[Math.min(i, verse.length - 1)])})`);
const snap = () => page.send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true }).then((r) => r.data);

const stills = flag("--stills");
if (stills) {
  const dir = flag("--dir") ?? join(HERE, "stills");
  mkdirSync(dir, { recursive: true });
  for (const s of String(stills).split(",").map(Number)) {
    await draw(Math.round(s * film.fps));
    writeFileSync(join(dir, `t${s.toFixed(2).padStart(5, "0")}.png`), Buffer.from(await snap(), "base64"));
  }
  console.log("stills in", dir);
} else {
  const enc = await browser.page({ width: 400, height: 300 });
  await enc.goto(`${ORIGIN}/script.json`, 200); // any page of ours: VideoEncoder needs a secure context
  await enc.eval(`(async () => {
    window.chunks = []; window.config = null; window.failed = null;
    window.encoder = new VideoEncoder({
      output(chunk, meta) {
        if (meta?.decoderConfig?.description) window.config = new Uint8Array(meta.decoderConfig.description);
        const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
        window.chunks.push({ key: chunk.type === "key", data });
      },
      error(e) { window.failed = String(e); },
    });
    encoder.configure({ codec: "avc1.640028", width: ${W}, height: ${H}, bitrate: ${Number(flag("--bitrate") ?? 10e6)}, framerate: ${film.fps},
      latencyMode: "quality", hardwareAcceleration: "prefer-software", avc: { format: "avc" } });
    window.b64 = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768)); return btoa(s); };
    window.add = async (png, i) => {
      const bitmap = await createImageBitmap(await (await fetch("data:image/png;base64," + png)).blob());
      const frame = new VideoFrame(bitmap, { timestamp: Math.round(i * 1e6 / ${film.fps}), duration: Math.round(1e6 / ${film.fps}) });
      encoder.encode(frame, { keyFrame: i % ${film.fps * 2} === 0 });
      frame.close(); bitmap.close();
      while (encoder.encodeQueueSize > 4) await new Promise(r => setTimeout(r, 5));
      if (window.failed) throw new Error(window.failed);
      const out = window.chunks.map((c) => ({ key: c.key, data: b64(c.data) })); window.chunks = [];
      return out;
    };
  })()`);
  const total = Math.round(film.duration * film.fps);
  const samples = [];
  const take = (list) => { for (const c of list) samples.push({ key: c.key, data: Buffer.from(c.data, "base64") }); };
  const began = Date.now();
  for (let i = 0; i < total; i++) {
    await draw(i);
    take(await enc.eval(`add(${JSON.stringify(await snap())}, ${i})`));
    if (i % 150 === 0) console.log(`frame ${i}/${total}  ${((Date.now() - began) / 1000).toFixed(0)}s`);
  }
  take(await enc.eval(`encoder.flush().then(() => window.chunks.map((c) => ({ key: c.key, data: b64(c.data) })))`));
  const avcC = Buffer.from(await enc.eval(`b64(window.config)`), "base64");
  if (samples.length !== total) throw new Error(`Encoded ${samples.length} of ${total} frames`);
  writeFileSync(OUT, mp4({ samples, avcC, fps: film.fps, width: W, height: H }));
  console.log(`${OUT}  ${(samples.reduce((n, s) => n + s.data.length, 0) / 1e6).toFixed(1)} MB, ${total} frames`);
}
browser.close();
server.close();
