import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";

import type { TranscodePart } from "@actiontokens/api";
import type { Db } from "@actiontokens/db";
import { AppError, ErrorCodes } from "@actiontokens/errors";
import { assertPublicHttpUrl, keyFolder, putMediaFile, storageNetwork } from "@actiontokens/storage";

import {
  ffmpeg,
  fullArgs,
  peaksOf,
  previewArgs,
  previewWindow,
  probeDuration,
  samplesArgs,
  stemArgs,
} from "./ffmpeg";

/** Where files come from and go to; tests swap in local copies. */
export type MediaIo = {
  download: (url: string, dest: string) => Promise<void>;
  put: (key: string, file: string, contentType: string) => Promise<void>;
};

/** Uploads are public URLs (ours, or the old app's); never a private address. */
export const mediaIo: MediaIo = {
  async download(url, dest) {
    const response = await fetch(await assertPublicHttpUrl(url), { redirect: "error" });
    if (!response.ok || !response.body)
      throw new AppError(ErrorCodes.EXTERNAL_SERVICE_FAILED, {
        message: `Couldn't download the recording (${response.status}).`,
      });
    await pipeline(
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>),
      createWriteStream(dest),
    );
  },
  put: putMediaFile,
};

/** A fresh random folder per run, so a new preview never reuses an old (possibly shared) key. */
const folderFor = (itemId: string, artistId: string | null | undefined) =>
  `${keyFolder({
    network: storageNetwork(),
    owner: artistId ? "artists" : "shared",
    ownerId: artistId ?? undefined,
    kind: `items/${itemId}/media`,
  })}/${randomBytes(16).toString("hex")}`;

export type TranscodeResult = {
  itemId: string;
  part: TranscodePart;
  skipped?: string;
  durationSec?: number;
  stems?: number;
};

/**
 * One `media.transcode` job (see services/media/processing for the parts).
 * Marks the song PROCESSING, then READY with its files. When it throws, the
 * queue tries again later; only the last attempt marks it FAILED, which
 * shows "Couldn't process" with a Retry. Until READY the song plays as uploaded.
 */
export async function transcodeItem(
  db: Db,
  io: MediaIo,
  job: { itemId: string; part: TranscodePart; lastAttempt: boolean },
): Promise<TranscodeResult> {
  const { itemId, part } = job;
  const media = await db.itemMedia.findUnique({
    where: { itemId },
    select: {
      mediaType: true,
      sourceUrl: true,
      previewStartSec: true,
      status: true,
      item: { select: { artistId: true } },
    },
  });
  if (media?.mediaType !== "AUDIO") return { itemId, part, skipped: "no audio" };
  // A preview or stem redo only makes sense on top of finished files.
  if (part !== "all" && media.status !== "READY") return { itemId, part, skipped: media.status };

  const dir = await mkdtemp(path.join(tmpdir(), `transcode-${itemId}-`));
  const folder = folderFor(itemId, media.item?.artistId);
  try {
    if (part === "all")
      await db.itemMedia.update({ where: { itemId }, data: { status: "PROCESSING" } });

    const data: {
      streamKey?: string;
      previewKey?: string;
      waveformKey?: string;
      durationSec?: number;
    } = {};
    if (part !== "stems") {
      const input = path.join(dir, "source");
      await io.download(media.sourceUrl, input);
      const duration = await probeDuration(input);

      const preview = path.join(dir, "preview.m4a");
      await ffmpeg(previewArgs(input, preview, previewWindow(duration, media.previewStartSec)));
      data.previewKey = `${folder}/preview.m4a`;
      await io.put(data.previewKey, preview, "audio/mp4");

      if (part === "all") {
        const full = path.join(dir, "full.m4a");
        await ffmpeg(fullArgs(input, full));
        data.streamKey = `${folder}/full.m4a`;
        await io.put(data.streamKey, full, "audio/mp4");

        const waveform = path.join(dir, "waveform.json");
        await writeFile(waveform, JSON.stringify(peaksOf(await ffmpeg(samplesArgs(input)))));
        data.waveformKey = `${folder}/waveform.json`;
        await io.put(data.waveformKey, waveform, "application/json");
        data.durationSec = Math.max(1, Math.round(duration));
      }
    }

    const stems = part === "preview" ? 0 : await transcodeStems(db, io, itemId, dir, folder);

    await db.itemMedia.update({
      where: { itemId },
      data: { ...data, ...(part === "all" ? { status: "READY" } : {}) },
    });
    return { itemId, part, durationSec: data.durationSec, stems };
  } catch (error) {
    if (part === "all")
      await db.itemMedia
        .update({ where: { itemId }, data: { status: job.lastAttempt ? "FAILED" : "PENDING" } })
        .catch(() => undefined);
    throw error;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Stems not yet processed, one at a time (each can be a full-length file). */
async function transcodeStems(db: Db, io: MediaIo, itemId: string, dir: string, folder: string) {
  const stems = await db.itemStem.findMany({
    where: { itemId, streamKey: null },
    orderBy: { trackIndex: "asc" },
    select: { id: true, sourceUrl: true },
  });
  let done = 0;
  for (const stem of stems) {
    // Seeded demo stems live in the app's public folder: nothing to process.
    if (!/^https?:\/\//.test(stem.sourceUrl)) continue;
    const input = path.join(dir, `stem-${stem.id}`);
    const output = path.join(dir, `stem-${stem.id}.m4a`);
    await io.download(stem.sourceUrl, input);
    await ffmpeg(stemArgs(input, output));
    const key = `${folder}/stems/${stem.id}.m4a`;
    await io.put(key, output, "audio/mp4");
    await db.itemStem.update({ where: { id: stem.id }, data: { streamKey: key } });
    done += 1;
  }
  return done;
}
