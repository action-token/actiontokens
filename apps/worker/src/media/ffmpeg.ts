import { spawn } from "node:child_process";

import { AppError, ErrorCodes } from "@bandcoin/errors";

/**
 * The ffmpeg recipes for playable music, ported from the old bandfan worker
 * (package/express-wadzzo): a full AAC track for owners, a 30 s preview for
 * everyone else, stems for the stem player, plus a waveform for the player.
 * Argument builders are pure; `ffmpeg` and `probeDuration` run the binaries.
 */

export const PREVIEW_SECONDS = 30;
/** Streaming loudness: −14 LUFS, peaks under −1.5 dB. */
const LOUDNORM = "loudnorm=I=-14:TP=-1.5:LRA=11";
const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";
/** Bars in a waveform, and the sample rate the peaks are read at. */
export const WAVEFORM_BARS = 800;
const WAVEFORM_RATE = 1000;

/** 30 s from the artist's chosen start, pulled back so it fits inside the track. */
export function previewWindow(durationSec: number, startSec: number) {
  const length = Math.min(PREVIEW_SECONDS, durationSec);
  const start = Math.min(Math.max(0, startSec), Math.max(0, durationSec - length));
  return { start, length };
}

const aac = (bitrate: string, output: string) => [
  "-c:a",
  "aac",
  "-b:a",
  bitrate,
  "-ar",
  "44100",
  "-movflags",
  "+faststart",
  output,
];

export function fullArgs(input: string, output: string): string[] {
  return [
    ...["-hide_banner", "-y", "-i", input, "-vn", "-map_metadata", "-1"],
    ...["-af", LOUDNORM],
    ...aac("256k", output),
  ];
}

export function previewArgs(
  input: string,
  output: string,
  window: { start: number; length: number },
): string[] {
  const fadeOut = Math.max(0, window.length - 2);
  return [
    ...["-hide_banner", "-y", "-ss", String(window.start), "-t", String(window.length)],
    ...["-i", input, "-vn", "-map_metadata", "-1"],
    ...["-af", `afade=t=in:st=0:d=1,afade=t=out:st=${fadeOut}:d=2,${LOUDNORM}`],
    ...aac("128k", output),
  ];
}

/** Stems keep their relative levels: no loudness normalisation, so they add up to the mix. */
export function stemArgs(input: string, output: string): string[] {
  return [
    ...["-hide_banner", "-y", "-i", input, "-vn", "-map_metadata", "-1"],
    ...aac("256k", output),
  ];
}

/** Mono 16-bit samples at a low rate, written to stdout, for the waveform. */
export function samplesArgs(input: string): string[] {
  return [
    ...["-hide_banner", "-v", "error", "-i", input, "-vn"],
    ...["-ac", "1", "-ar", String(WAVEFORM_RATE), "-f", "s16le", "-"],
  ];
}

/** The loudest sample in each of `bars` equal slices, 0–1, two decimals. */
export function peaksOf(samples: Buffer, bars = WAVEFORM_BARS): number[] {
  const count = Math.floor(samples.length / 2);
  if (count === 0) return [];
  const per = Math.max(1, Math.ceil(count / bars));
  const peaks: number[] = [];
  for (let from = 0; from < count; from += per) {
    let max = 0;
    for (let i = from; i < Math.min(count, from + per); i++)
      max = Math.max(max, Math.abs(samples.readInt16LE(i * 2)));
    peaks.push(Math.round((max / 32768) * 100) / 100);
  }
  return peaks;
}

function run(bin: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => (err = (err + chunk.toString()).slice(-4000)));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(out))
        : reject(new Error(`${bin} exited ${code}: ${err.trim().split("\n").at(-1)}`)),
    );
  });
}

export const ffmpeg = (args: string[]) => run(FFMPEG, args);

export async function probeDuration(input: string): Promise<number> {
  const out = await run(FFPROBE, [
    ...["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", input],
  ]);
  const seconds = Number.parseFloat(out.toString().trim());
  if (!Number.isFinite(seconds) || seconds <= 0)
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: "Couldn't read the recording's length.",
    });
  return seconds;
}
