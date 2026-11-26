// Which cut of the film a tool works on. `--cut short` uses scene/script.short.json, audio/short/
// and writes campusverse-short.mp4; with no --cut, the full film: scene/script.json, audio/,
// campusverse.mp4.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = join(dirname(fileURLToPath(import.meta.url)), "..");
const i = process.argv.indexOf("--cut");
export const CUT = i < 0 ? null : process.argv[i + 1];
export const SCRIPT = join(HERE, "scene", CUT ? `script.${CUT}.json` : "script.json");
export const AUDIO = CUT ? join(HERE, "audio", CUT) : join(HERE, "audio");
export const FILM = join(HERE, CUT ? `campusverse-${CUT}.mp4` : "campusverse.mp4");
