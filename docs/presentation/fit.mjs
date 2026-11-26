// Gives each scene the time its narration takes, keeping the film's length, and moves the beats
// with their scenes. Run after narrate.mjs; it rewrites scene/script.json and audio/voice.json.
//
//   node docs/presentation/fit.mjs [--cut short]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RATE, readWav } from "./lib/wav.mjs";
import { AUDIO, SCRIPT } from "./lib/cut.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const file = SCRIPT;
const script = JSON.parse(readFileSync(file, "utf8"));
const FIRST_LEAD = 0.95; // Verse pops in and its bubble opens before it speaks
const LEAD = 0.4; // every other scene: the bubble opens, then the voice starts

const spoken = script.scenes.map((s) => readWav(join(AUDIO, `${s.id}.wav`)).length / RATE);
const leads = script.scenes.map((_, i) => (i === 0 ? FIRST_LEAD : LEAD));
const used = spoken.reduce((a, b) => a + b, 0) + leads.reduce((a, b) => a + b, 0);
const tail = (script.duration - used) / script.scenes.length;
if (tail < 0.25) {
  const needs = (used + 0.25 * script.scenes.length).toFixed(1);
  throw new Error(`The narration needs ${needs}s but the film is ${script.duration}s: raise --rate in narrate.mjs or shorten a line.`);
}

const round = (x) => Math.round(x * 100) / 100;
const old = script.scenes.map((s) => ({ start: s.start, end: s.end }));
const voice = {};
let at = 0;
script.scenes.forEach((s, i) => {
  s.start = round(at);
  at += leads[i] + spoken[i] + tail;
  s.end = i === script.scenes.length - 1 ? script.duration : round(at);
  voice[s.id] = { file: `${s.id}.wav`, lead: leads[i], seconds: round(spoken[i]) };
});
// A beat with a "cue" lands as those words are said: its frame lights up 0.55s after the beat
// starts (the camera's move), so the beat starts that much before the words. Others keep their
// place in their scene.
const LIGHTS = 0.55;
const said = (s) => (s.say ?? s.line).replace("R-127", "R one twenty-seven");
let last = 0;
for (const beat of script.beats) {
  const i = old.findLastIndex((o) => beat.t >= o.start);
  const now = script.scenes[i];
  if (beat.cue) {
    const text = said(now).toLowerCase(), at = text.indexOf(beat.cue.toLowerCase());
    if (at < 0) throw new Error(`Cue "${beat.cue}" is not in the ${now.id} line`);
    beat.t = now.start + leads[i] + (at / text.length) * spoken[i] - LIGHTS;
  } else {
    const share = (beat.t - old[i].start) / (old[i].end - old[i].start);
    beat.t = now.start + share * (now.end - now.start);
  }
  // Room to read a labelled highlight before the next one: 1.4s after it, 0.9s after any other.
  beat.t = round(Math.max(beat.t, now.start, last));
  last = beat.t + (beat.label ? 1.4 : 0.9);
}

// One scene and one beat to a line, so the file stays readable and its changes easy to review.
const line = (x) => "    { " + Object.entries(x).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(", ") + " }";
const lines = (list) => list.map(line).join(",\n");
writeFileSync(file, `{\n  "fps": ${script.fps},\n  "duration": ${script.duration},\n  "scenes": [\n${lines(script.scenes)}\n  ],\n  "beats": [\n${lines(script.beats)}\n  ]\n}\n`);
writeFileSync(join(AUDIO, "voice.json"), JSON.stringify(voice, null, 1) + "\n");
script.scenes.forEach((s, i) => console.log(s.id.padEnd(10), `${s.start.toFixed(2)} - ${s.end.toFixed(2)}`, ` voice ${spoken[i].toFixed(2)}s`));
console.log(`pause after each line: ${tail.toFixed(2)}s`);
