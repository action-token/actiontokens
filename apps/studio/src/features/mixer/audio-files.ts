import { unzip, unzipSync } from "fflate";

import { AUDIO_BY_EXTENSION, extensionOf } from "../../lib/upload";

/** What the file picker offers: any audio, and zips of audio. */
export const ACCEPT = [
  "audio/*",
  ".zip",
  "application/zip",
  ...Object.keys(AUDIO_BY_EXTENSION).map((extension) => `.${extension}`),
].join(",");

/** The biggest zip unpacked in the browser. */
export const MAX_ZIP_BYTES = 500 * 1024 * 1024;

export const isAudioName = (name: string) => extensionOf(name) in AUDIO_BY_EXTENSION;

export const isZip = (file: File) => extensionOf(file.name) === "zip" || file.type.includes("zip");

type Entry = { name: string; bytes: Uint8Array; type: string };

/** Only audio, never folders, hidden files or the Mac's __MACOSX copies. */
const wanted = (path: string) => {
  const base = path.split("/").pop() ?? "";
  return (
    !path.endsWith("/") &&
    !path.startsWith("__MACOSX/") &&
    !base.startsWith(".") &&
    isAudioName(base)
  );
};

const toEntries = (files: Record<string, Uint8Array>): Entry[] =>
  Object.entries(files).map(([path, bytes]) => {
    const name = path.split("/").pop()!;
    return { name, bytes, type: AUDIO_BY_EXTENSION[extensionOf(name)]! };
  });

/** The audio files inside a zip, in the zip's order (folders flattened). */
export function audioInZip(zip: Uint8Array): Entry[] {
  return toEntries(unzipSync(zip, { filter: (file) => wanted(file.name) }));
}

/** The same, off the main thread where the browser allows it, so big zips don't freeze the page. */
export async function unzipAudio(file: File): Promise<File[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
    unzip(bytes, { filter: (entry) => wanted(entry.name) }, (error, result) =>
      error ? reject(error) : resolve(result),
    ),
  );
  return toEntries(files).map(
    (entry) => new File([entry.bytes as BlobPart], entry.name, { type: entry.type }),
  );
}
