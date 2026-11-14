/**
 * Where a file lives in the one shared bucket:
 *
 *   <network>/<owner>/<ownerId>/<kind>/<name>
 *   mainnet/artists/ck12ab/items/ck99xy/media/full.m4a
 *   testnet/users/ck55qq/avatars/9f2c….jpg
 *   mainnet/shared/generated/9f2c….png          (no owner)
 *   _unreferenced/<old flat key>                (migrated files no row points at)
 *
 * The network comes first so a whole network can be listed, expired or deleted
 * by prefix. Every part is checked, so a user-supplied id can't climb out of its folder.
 */

import { AppError, ErrorCodes, isEnvValidationSkipped } from "@bandcoin/errors";

export type StorageNetwork = "mainnet" | "testnet";

export type KeyOwner = "artists" | "users" | "shared";

const SAFE_PART = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SAFE_EXT = /^[a-z0-9]{1,8}$/;

function part(label: string, value: string): string {
  if (!SAFE_PART.test(value) || value.includes("..")) {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: `Unsafe ${label} in storage key: ${JSON.stringify(value)}`,
    });
  }
  return value;
}

/** A `/`-separated path of safe parts (a kind like `items/<id>/media`). */
function path(label: string, value: string): string {
  return value
    .split("/")
    .map((p) => part(label, p))
    .join("/");
}

export interface ObjectKeyParts {
  network: StorageNetwork;
  owner: KeyOwner;
  /** Required for `artists` and `users`; leave out for `shared`. */
  ownerId?: string;
  /** What the file is for, e.g. `images`, `avatars`, `items/<itemId>/media`, `pins/<pinId>`. */
  kind: string;
  /** File name without extension (a random id, or a fixed name like `full`). */
  name: string;
  /** Without the dot; lower-case. Omit for none. */
  ext?: string;
}

/** The folder (no trailing slash) for a file: `<network>/<owner>/<ownerId>/<kind>`. */
export function keyFolder({
  network,
  owner,
  ownerId,
  kind,
}: Omit<ObjectKeyParts, "name" | "ext">): string {
  if (network !== "mainnet" && network !== "testnet")
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: `Unknown network ${String(network)}`,
    });
  if (owner !== "shared" && !ownerId)
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: `${owner} keys need an ownerId` });
  if (owner === "shared" && ownerId)
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: "shared keys have no ownerId" });
  const folder = owner === "shared" ? [owner] : [owner, part("ownerId", ownerId!)];
  return [network, ...folder, path("kind", kind)].join("/");
}

/** The bucket key for a new file. */
export function objectKey({ name, ext, ...folder }: ObjectKeyParts): string {
  const extension = ext === undefined || ext === "" ? "" : `.${checkExt(ext)}`;
  return `${keyFolder(folder)}/${part("name", name)}${extension}`;
}

/** Where a new upload goes: whose it is and what it is for. The network is the app's own. */
export interface Placement {
  owner: KeyOwner;
  ownerId?: string;
  kind: string;
}

/** For uploads whose owner the caller doesn't know: still under the network, never the bucket root. */
export const SHARED_UPLOADS: Placement = { owner: "shared", kind: "uploads" };

/**
 * The network this deployment's files belong to, from the same setting the chain code reads
 * (`NEXT_PUBLIC_STELLAR_NETWORK`), so testnet and mainnet can't write into each other's folders.
 */
export function storageNetwork(
  env: Record<string, string | undefined> = process.env,
): StorageNetwork {
  const name =
    env.NEXT_PUBLIC_STELLAR_NETWORK ?? (isEnvValidationSkipped() ? "testnet" : undefined);
  if (name === "mainnet" || name === "testnet") return name;
  throw new AppError(ErrorCodes.VALIDATION_FAILED, {
    message: "NEXT_PUBLIC_STELLAR_NETWORK must be testnet or mainnet",
  });
}

function checkExt(ext: string): string {
  const e = ext.toLowerCase();
  if (!SAFE_EXT.test(e))
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: `Unsafe extension ${JSON.stringify(ext)}`,
    });
  return e;
}

/** Where a migrated file goes when no database row points at it. Keeps the old key so it can be found. */
export function unreferencedKey(oldKey: string): string {
  if (!oldKey || oldKey.startsWith("/") || oldKey.split("/").includes("..")) {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: `Unsafe old key ${JSON.stringify(oldKey)}`,
    });
  }
  return `_unreferenced/${oldKey}`;
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/csv": "csv",
  "model/gltf-binary": "glb",
};

/**
 * Extension for a file: from its name if it has a sensible one, else from its
 * content type. Empty when neither tells (the key just has no extension).
 */
export function extensionFor(
  fileName: string | undefined,
  contentType: string | undefined,
): string {
  const fromName = /\.([A-Za-z0-9]{1,8})$/.exec(fileName ?? "")?.[1]?.toLowerCase();
  if (fromName) return fromName;
  return EXT_BY_TYPE[(contentType ?? "").split(";")[0]!.trim().toLowerCase()] ?? "";
}
