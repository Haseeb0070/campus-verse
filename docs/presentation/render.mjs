// Renders the presentation film to an MP4, with nothing to install beyond Node 22 and Chrome.
//
//   node docs/presentation/render.mjs                    the whole film -> campusverse.mp4
//   node docs/presentation/render.mjs --cut short        the short cut -> campusverse-short.mp4
//   node docs/presentation/render.mjs --stills 3,10,25   single frames (PNG) at those seconds
//   node docs/presentation/render.mjs --seconds 8        only the first 8 seconds, to test
//   node docs/presentation/render.mjs --serve            just serve the scene, to open in a browser
//
// How: headless Chrome draws scene/index.html one frame at a time (the scene is a pure function
// of time), each frame is screenshotted, and the pictures are encoded to H.264 with Chrome's own
// VideoEncoder. The MP4 file around that video is written here, by hand.
import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launch } from "./lib/cdp.mjs";
import { RATE, readWav } from "./lib/wav.mjs";
import { AUDIO, FILM, SCRIPT } from "./lib/cut.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "..", "..", "web");
const W = 1920, H = 1080;
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1] ?? true; };
const OUT = flag("--out") ?? FILM;

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
  else if (path === "/script.json") file = SCRIPT;
  else if (path.startsWith("/audio/")) file = join(AUDIO, normalize(path.slice("/audio/".length)));
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

// ---------- Jerry (the site calls this guide Verse): the same character and engine the site uses, stepped one frame at a time ----------
const core = await import(pathToFileURL(join(WEB, "node_modules/@bible-strong/avatar-core/dist/index.js")));
const script = JSON.parse(readFileSync(SCRIPT, "utf8"));
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
  const engine = core.createAvatarEngine({ seed: core.seedOfName("Jerry"), compact: false });
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

/** An MPEG-4 descriptor: a tag, its length, its bytes (lengths here are always under 128). */
const descriptor = (tag, ...parts) => { const body = Buffer.concat(parts); return Buffer.concat([Buffer.from([tag, body.length]), body]); };

/**
 * An MP4 with one H.264 video track and, when there is narration, one AAC audio track.
 * video: { samples (AVCC frames in order), avcC, fps, width, height }
 * audio: { samples (raw AAC frames of 1024 samples), config (AudioSpecificConfig), rate, channels }
 */
function mp4(video, audio) {
  const MOVIE = 1000; // the movie's own clock: milliseconds
  const tracks = [{
    kind: "vide", name: "VideoHandler", samples: video.samples, scale: video.fps * 1000, delta: 1000, perChunk: video.fps,
    entry: box("avc1",
      Buffer.alloc(6), u16(1), Buffer.alloc(16), u16(video.width), u16(video.height), u32(0x480000), u32(0x480000), u32(0), u16(1),
      Buffer.alloc(32), u16(24), u16(0xffff), box("avcC", video.avcC),
      box("colr", Buffer.from("nclx"), u16(1), u16(1), u16(1), Buffer.from([0]))),
    header: full("vmhd", 0, 1, Buffer.alloc(8)),
    size: [video.width, video.height], volume: 0,
  }];
  if (audio) {
    tracks.push({
      kind: "soun", name: "SoundHandler", samples: audio.samples, scale: audio.rate, delta: 1024, perChunk: Math.round(audio.rate / 1024),
      entry: box("mp4a",
        Buffer.alloc(6), u16(1), Buffer.alloc(8), u16(audio.channels), u16(16), u32(0), u16(audio.rate), u16(0),
        full("esds", 0, 0, descriptor(3, u16(1), Buffer.from([0]),
          descriptor(4, Buffer.from([0x40, 0x15, 0, 0, 0]), u32(128000), u32(128000), descriptor(5, audio.config)),
          descriptor(6, Buffer.from([2]))))),
      header: full("smhd", 0, 0, Buffer.alloc(4)),
      size: [0, 0], volume: 0x100,
    });
  }
  // About a second of each track in turn, so a player never has to read far ahead for either.
  for (const t of tracks) {
    t.chunks = [];
    for (let i = 0; i < t.samples.length; i += t.perChunk) t.chunks.push(t.samples.slice(i, i + t.perChunk));
    t.ms = Math.round((t.samples.length * t.delta * MOVIE) / t.scale);
  }
  const order = [];
  for (let c = 0; c < Math.max(...tracks.map((t) => t.chunks.length)); c++) {
    for (const t of tracks) if (t.chunks[c]) order.push({ track: t, chunk: t.chunks[c] });
  }
  const ftyp = box("ftyp", Buffer.from("isom"), u32(512), Buffer.from("isomiso2avc1mp41"));
  const moov = (firstByte) => {
    let at = firstByte;
    const offsets = new Map(tracks.map((t) => [t, []]));
    for (const { track, chunk } of order) {
      offsets.get(track).push(at);
      at += chunk.reduce((n, s) => n + s.data.length, 0);
    }
    const traks = tracks.map((t, index) => {
      const keys = t.kind === "vide" ? t.samples.flatMap((s, i) => (s.key ? [i + 1] : [])) : null;
      // Every chunk holds the same number of samples except, perhaps, the last.
      const runs = [[1, t.chunks[0].length]];
      const lastChunk = t.chunks[t.chunks.length - 1];
      if (t.chunks.length > 1 && lastChunk.length !== t.chunks[0].length) runs.push([t.chunks.length, lastChunk.length]);
      const stbl = box("stbl", full("stsd", 0, 0, u32(1), t.entry),
        full("stts", 0, 0, u32(1), u32(t.samples.length), u32(t.delta)),
        ...(keys ? [full("stss", 0, 0, u32(keys.length), ...keys.map(u32))] : []),
        full("stsc", 0, 0, u32(runs.length), ...runs.flatMap(([first, count]) => [u32(first), u32(count), u32(1)])),
        full("stsz", 0, 0, u32(0), u32(t.samples.length), ...t.samples.map((s) => u32(s.data.length))),
        full("stco", 0, 0, u32(t.chunks.length), ...offsets.get(t).map(u32)));
      const minf = box("minf", t.header, box("dinf", full("dref", 0, 0, u32(1), full("url ", 0, 1))), stbl);
      const mdia = box("mdia",
        full("mdhd", 0, 0, u32(0), u32(0), u32(t.scale), u32(t.samples.length * t.delta), u16(0x55c4), u16(0)),
        full("hdlr", 0, 0, u32(0), Buffer.from(t.kind), Buffer.alloc(12), Buffer.from(t.name + "\0")),
        minf);
      return box("trak",
        full("tkhd", 0, 3, u32(0), u32(0), u32(index + 1), u32(0), u32(t.ms), Buffer.alloc(8), u16(0), u16(0), u16(t.volume), u16(0), MATRIX, u32(t.size[0] << 16), u32(t.size[1] << 16)),
        mdia);
    });
    return box("moov",
      full("mvhd", 0, 0, u32(0), u32(0), u32(MOVIE), u32(Math.max(...tracks.map((t) => t.ms))), u32(0x10000), u16(0x100), Buffer.alloc(10), MATRIX, Buffer.alloc(24), u32(tracks.length + 1)),
      ...traks);
  };
  // The index goes before the media so the file starts playing at once; its size doesn't depend
  // on where the media starts, so build it once to measure and once for real.
  const start = ftyp.length + moov(0).length + 8;
  return Buffer.concat([ftyp, moov(start), box("mdat", ...order.flatMap(({ chunk }) => chunk.map((s) => s.data)))]);
}

// ---------- Narration ----------
/** One track of the whole film's narration, every line at the same loudness, as 16-bit samples. */
function narration(duration) {
  const file = join(AUDIO, "voice.json");
  if (!existsSync(file)) return null;
  const voice = JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, ""));
  const mix = new Float32Array(Math.ceil(duration * RATE));
  for (const scene of script.scenes) {
    const v = voice[scene.id];
    if (!v) continue;
    const clip = readWav(join(AUDIO, v.file));
    // Same loudness for every line (about -19 dB RMS), never above -1 dB at the peaks.
    let sum = 0, peak = 0;
    for (const x of clip) { sum += x * x; peak = Math.max(peak, Math.abs(x)); }
    const gain = Math.min(0.112 / Math.sqrt(sum / clip.length), 0.89 / peak);
    const start = Math.round((scene.start + v.lead) * RATE);
    const over = (start + clip.length) / RATE - scene.end;
    if (over > 0) console.warn(`  "${scene.id}" narration runs ${over.toFixed(2)}s past its scene`);
    for (let i = 0; i < clip.length && start + i < mix.length; i++) mix[start + i] += clip[i] * gain;
  }
  return Int16Array.from(mix, (x) => Math.round(Math.max(-1, Math.min(1, x)) * 32767));
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
  // The encoder lives in the scene's own tab: a second tab would put this one in the background,
  // where Chrome stops drawing it and screenshots stall.
  const enc = page;
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
  const seconds = Number(flag("--seconds") ?? film.duration); // --seconds 8 renders just the start, to test
  const total = Math.round(seconds * film.fps);
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

  // The narration, encoded to AAC by the same browser.
  let audio = null;
  const pcm = narration(seconds);
  if (pcm) {
    const sound = await enc.eval(`(async () => {
      const pcm = new Int16Array(Uint8Array.from(atob(${JSON.stringify(Buffer.from(pcm.buffer).toString("base64"))}), (c) => c.charCodeAt(0)).buffer);
      const frames = []; let config = null, failed = null;
      const encoder = new AudioEncoder({
        output(chunk, meta) {
          if (meta?.decoderConfig?.description) config = new Uint8Array(meta.decoderConfig.description);
          const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data); frames.push(b64(data));
        },
        error(e) { failed = String(e); },
      });
      encoder.configure({ codec: "mp4a.40.2", sampleRate: ${RATE}, numberOfChannels: 1, bitrate: 128000 });
      for (let i = 0; i < pcm.length; i += 1024) {
        const data = new Int16Array(1024); data.set(pcm.subarray(i, i + 1024));
        const block = new AudioData({ format: "s16", sampleRate: ${RATE}, numberOfFrames: 1024, numberOfChannels: 1, timestamp: Math.round(i * 1e6 / ${RATE}), data });
        encoder.encode(block); block.close();
      }
      await encoder.flush();
      if (failed) throw new Error(failed);
      return { frames, config: b64(config) };
    })()`);
    audio = {
      samples: sound.frames.map((f) => ({ data: Buffer.from(f, "base64") })),
      config: Buffer.from(sound.config, "base64"), rate: RATE, channels: 1,
    };
  }
  writeFileSync(OUT, mp4({ samples, avcC, fps: film.fps, width: W, height: H }, audio));
  const size = [...samples, ...(audio?.samples ?? [])].reduce((n, s) => n + s.data.length, 0);
  console.log(`${OUT}  ${(size / 1e6).toFixed(1)} MB, ${total} frames, ${audio ? "with narration" : "no sound"}`);
}
browser.close();
server.close();
