/**
 * Development only. Gives one song four demo stems (drums, bass, chords, lead:
 * a generated 20 second loop) and makes one account its owner, so the player's
 * stem mixer can be tried. The WAV files are written to apps/app/public/demo-stems
 * (not committed).
 *
 *   pnpm --filter @bandcoin/db exec tsx scripts/seed-demo-stems.ts "Gold Hour" "Fyron Alias"
 *   pnpm --filter @bandcoin/db exec tsx scripts/seed-demo-stems.ts "Gold Hour" "Fyron Alias" --remove
 */
import "dotenv/config";

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { db } from "../src/client";

const RATE = 22050;
const BPM = 96;
const BEAT = 60 / BPM;
const BARS = 8;
const SECONDS = BARS * 4 * BEAT;
const ROOTS = [55, 43.65, 65.41, 49];
const CHORDS = [
  [220, 261.63, 329.63],
  [174.61, 220, 261.63],
  [261.63, 329.63, 392],
  [196, 246.94, 293.66],
];
const STEMS = [
  { key: "drums", name: "Drums", color: "#f0b429" },
  { key: "bass", name: "Bass", color: "#4aa3df" },
  { key: "chords", name: "Chords", color: "#b779e6" },
  { key: "lead", name: "Lead", color: "#dbdc2c" },
] as const;

const wave = (type: "sine" | "saw" | "tri", phase: number) =>
  type === "sine"
    ? Math.sin(2 * Math.PI * phase)
    : type === "saw"
      ? 2 * (phase % 1) - 1
      : 2 * Math.abs(2 * (phase % 1) - 1) - 1;

function tone(
  out: Float32Array,
  type: "sine" | "saw" | "tri",
  freq: number,
  at: number,
  length: number,
  peak: number,
) {
  const first = Math.floor(at * RATE);
  const count = Math.floor(length * RATE);
  for (let i = 0; i < count && first + i < out.length; i += 1) {
    const t = i / RATE;
    const envelope = Math.min(1, t / 0.01) * Math.exp(-t * (4 / length));
    out[first + i]! += wave(type, freq * t) * peak * envelope;
  }
}

function burst(out: Float32Array, at: number, length: number, peak: number, tonal = 0) {
  const first = Math.floor(at * RATE);
  const count = Math.floor(length * RATE);
  for (let i = 0; i < count && first + i < out.length; i += 1) {
    const t = i / RATE;
    const noise = Math.random() * 2 - 1;
    const kick = tonal
      ? Math.sin(2 * Math.PI * (45 * t + (105 * (1 - Math.exp(-30 * t))) / 30))
      : 0;
    out[first + i]! += (tonal ? kick : noise) * peak * Math.exp(-t * (5 / length));
  }
}

function render(key: (typeof STEMS)[number]["key"]) {
  const out = new Float32Array(Math.ceil(SECONDS * RATE));
  for (let bar = 0; bar < BARS; bar += 1) {
    const block = Math.floor(bar / 2);
    if (key === "chords")
      for (const f of CHORDS[block]!) tone(out, "tri", f, bar * 4 * BEAT, BEAT * 3.6, 0.13);
    for (let beat = 0; beat < 4; beat += 1) {
      const at = (bar * 4 + beat) * BEAT;
      if (key === "drums") {
        if (beat % 2 === 0) burst(out, at, 0.25, 0.8, 1);
        else burst(out, at, 0.14, 0.4);
        burst(out, at, 0.03, 0.12);
        burst(out, at + BEAT / 2, 0.03, 0.09);
      }
      for (const half of [0, 1]) {
        const eighth = beat * 2 + half;
        const when = (bar * 4 + eighth / 2) * BEAT;
        if (key === "bass" && eighth % 4 !== 3)
          tone(
            out,
            "saw",
            eighth === 4 ? ROOTS[block]! * 2 : ROOTS[block]!,
            when,
            BEAT * 0.45,
            0.2,
          );
        if (key === "lead")
          tone(out, "sine", CHORDS[block]![(eighth * 2 + bar) % 3]! * 2, when, BEAT * 0.5, 0.2);
      }
    }
  }
  return out;
}

function wav(samples: Float32Array) {
  const data = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (at: number, value: string) =>
    [...value].forEach((char, i) => data.setUint8(at + i, char.charCodeAt(0)));
  text(0, "RIFF");
  data.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, 1, true);
  data.setUint32(24, RATE, true);
  data.setUint32(28, RATE * 2, true);
  data.setUint16(32, 2, true);
  data.setUint16(34, 16, true);
  text(36, "data");
  data.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) =>
    data.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 32767, true),
  );
  return Buffer.from(data.buffer);
}

const [title, displayName] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const remove = process.argv.includes("--remove");
if (!title || !displayName)
  throw new Error('Usage: seed-demo-stems.ts "<song title>" "<display name>" [--remove]');

if (!/ep-shy-leaf/.test(process.env.DATABASE_URL ?? ""))
  throw new Error("Refusing to run: DATABASE_URL is not the development database.");

const item = await db.item.findFirst({
  where: { title, type: "TRACK", deletedAt: null },
  select: { id: true },
});
const user = await db.user.findFirst({ where: { displayName }, select: { id: true } });
if (!item || !user)
  throw new Error(`Couldn't find the song "${title}" or the account "${displayName}".`);

const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
await db.itemStem.deleteMany({
  where: { itemId: item.id, sourceUrl: { startsWith: "/demo-stems/" } },
});

if (remove) {
  const removed = await db.ownership.deleteMany({
    where: { userId: user.id, itemId: item.id, source: "GIFT" },
  });
  console.log(`Removed the demo stems and ${removed.count} demo ownership row(s).`);
} else {
  const folder = join(process.cwd(), "../../apps/app/public/demo-stems");
  mkdirSync(folder, { recursive: true });
  for (const [index, stem] of STEMS.entries()) {
    writeFileSync(join(folder, `${slug}-${stem.key}.wav`), wav(render(stem.key)));
    await db.itemStem.create({
      data: {
        itemId: item.id,
        name: stem.name,
        color: stem.color,
        trackIndex: index,
        sourceUrl: `/demo-stems/${slug}-${stem.key}.wav`,
        endSec: SECONDS,
      },
    });
  }
  const owned = await db.ownership.findUnique({
    where: { userId_itemId: { userId: user.id, itemId: item.id } },
  });
  if (!owned)
    await db.ownership.create({
      data: { userId: user.id, itemId: item.id, quantity: 1, source: "GIFT" },
    });
  console.log(
    `Seeded ${STEMS.length} stems on "${title}"${owned ? "" : ` and made "${displayName}" its owner (source GIFT)`}.`,
  );
}
await db.$disconnect();
