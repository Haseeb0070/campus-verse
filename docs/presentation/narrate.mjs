// Reads Verse's lines aloud with a Microsoft neural voice: one WAV per scene in audio/.
//
//   node docs/presentation/narrate.mjs [--voice en-US-EmmaNeural] [--rate +0%] [--cut short]
//   node docs/presentation/fit.mjs        (then: gives each scene the time its line takes)
//
// Needs edge-tts (`uv tool install edge-tts`), which asks Microsoft's online speech service (the
// one Edge's Read Aloud uses) for each line, so it needs the internet. The MP3s it returns are
// decoded and resampled by headless Chrome into the 16-bit 44.1 kHz WAVs the renderer reads.
// A scene's "say" in scene/script.json replaces its caption for the voice.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "./lib/cdp.mjs";
import { RATE } from "./lib/wav.mjs";
import { AUDIO, SCRIPT } from "./lib/cut.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const VOICE = flag("--voice", "en-US-EmmaNeural");
const SPEED = flag("--rate", "+0%");
const EDGE_TTS = process.env.EDGE_TTS
  ?? [join(homedir(), ".local", "bin", "edge-tts.exe"), join(homedir(), ".local", "bin", "edge-tts")].find(existsSync)
  ?? "edge-tts";

const script = JSON.parse(readFileSync(SCRIPT, "utf8"));
const out = AUDIO;
mkdirSync(out, { recursive: true });

/** A 16-bit mono WAV of these samples (-1 to 1). */
function wav(samples) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(RATE, 24);
  b.writeUInt32LE(RATE * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((x, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x)) * 32767), 44 + i * 2));
  return b;
}

const browser = await launch({ port: 9337 });
const page = await browser.page({ width: 400, height: 300 });
await page.goto("about:blank", 200);
try {
  for (const scene of script.scenes) {
    const text = (scene.say ?? scene.line).replace(/R-127/g, "R one twenty-seven");
    const mp3 = join(out, `${scene.id}.mp3`);
    execFileSync(EDGE_TTS, ["--voice", VOICE, `--rate=${SPEED}`, "--text", text, "--write-media", mp3], { stdio: "ignore" });
    const samples = await page.eval(`(async () => {
      const bytes = Uint8Array.from(atob(${JSON.stringify(readFileSync(mp3).toString("base64"))}), (c) => c.charCodeAt(0));
      const decoded = await new OfflineAudioContext(1, 1, ${RATE}).decodeAudioData(bytes.buffer);
      const ctx = new OfflineAudioContext(1, Math.ceil(decoded.duration * ${RATE}), ${RATE});
      const src = ctx.createBufferSource(); src.buffer = decoded; src.connect(ctx.destination); src.start();
      return Array.from((await ctx.startRendering()).getChannelData(0), (x) => Math.round(x * 1e4) / 1e4);
    })()`);
    writeFileSync(join(out, `${scene.id}.wav`), wav(samples));
    rmSync(mp3);
    console.log(scene.id.padEnd(10), (samples.length / RATE).toFixed(2) + "s", text);
  }
} finally {
  browser.close();
}
