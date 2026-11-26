import { readFileSync } from "node:fs";

export const RATE = 44100;

/** The samples of a 16-bit mono WAV, as numbers from -1 to 1, with the silence at both ends cut off. */
export function readWav(path) {
  const b = readFileSync(path);
  let at = 12, data = null;
  while (at < b.length - 8) {
    const id = b.toString("latin1", at, at + 4), size = b.readUInt32LE(at + 4);
    if (id === "fmt " && (b.readUInt16LE(at + 10) !== 1 || b.readUInt32LE(at + 12) !== RATE || b.readUInt16LE(at + 22) !== 16)) {
      throw new Error(`${path}: expected 16-bit mono at ${RATE} Hz`);
    }
    if (id === "data") data = b.subarray(at + 8, at + 8 + size);
    at += 8 + size + (size % 2);
  }
  const all = Float32Array.from({ length: data.length >> 1 }, (_, i) => data.readInt16LE(i * 2) / 32768);
  const loud = (x) => Math.abs(x) > 0.01;
  const from = Math.max(0, all.findIndex(loud) - 400), to = Math.min(all.length, all.findLastIndex(loud) + 2000);
  return all.subarray(from, to);
}
