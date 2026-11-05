import { AppError, ErrorCodes } from "@bandcoin/errors";

/** The base64 SHA-256 of a file: the presigned upload only accepts exactly this file. */
export async function sha256Base64(file: Blob) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
  return btoa(String.fromCharCode(...digest));
}

/** Audio formats by file extension: what Studio accepts for the mixer and music. */
export const AUDIO_BY_EXTENSION: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  wave: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/opus",
  aac: "audio/aac",
  m4a: "audio/x-m4a",
  mp4: "audio/mp4",
  flac: "audio/flac",
  webm: "audio/webm",
  aif: "audio/aiff",
  aiff: "audio/aiff",
  caf: "audio/x-caf",
};

export const extensionOf = (name: string) =>
  name.includes(".") ? (name.split(".").pop()?.toLowerCase() ?? "") : "";

/**
 * Browsers send no type (or a generic one) for some files: audio is named by
 * its extension; anything else (.glb, .obj) goes to storage as plain bytes.
 */
function typeOf(file: File) {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  return AUDIO_BY_EXTENSION[extensionOf(file.name)] ?? "application/octet-stream";
}

/** The details the server signs an upload for. */
export async function declare(file: File) {
  return {
    fileName: file.name,
    fileType: typeOf(file),
    fileSize: file.size,
    checksum: await sha256Base64(file),
  };
}

/** PUT a file to its presigned URL, straight to storage. */
export async function putToStorage(file: File, signed: { uploadUrl: string }, checksum: string) {
  const response = await fetch(signed.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": typeOf(file), "x-amz-checksum-sha256": checksum },
    body: file,
  });
  if (!response.ok)
    throw new AppError(ErrorCodes.EXTERNAL_SERVICE_FAILED, {
      message: "The upload didn't go through. Try again.",
    });
}
