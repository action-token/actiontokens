import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { AppError, ErrorCodes, requireEnv } from "@bandcoin/errors";

/**
 * Secrets of the accounts the platform holds (artist issuers and storage) are
 * stored AES-256-GCM encrypted as "iv:tag:ciphertext" in hex, with one key
 * per environment (CHAIN_ACCOUNT_KEY, 64 hex chars). They are decrypted only
 * for the moment a transaction is signed.
 */
function key(raw = process.env.CHAIN_ACCOUNT_KEY) {
  const hex = requireEnv("CHAIN_ACCOUNT_KEY", raw);
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new AppError(ErrorCodes.CONFIG_MISSING, { message: "CHAIN_ACCOUNT_KEY must be 64 hex characters." });
  }
  return Buffer.from(hex, "hex");
}

export function encryptSecret(secret: string, rawKey?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(rawKey), iv);
  const data = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString("hex")).join(":");
}

export function decryptSecret(payload: string, rawKey?: string): string {
  const [iv, tag, data] = payload.split(":");
  if (!iv || !tag || !data) throw new AppError(ErrorCodes.INTERNAL, { message: "Unknown secret format" });
  const decipher = createDecipheriv("aes-256-gcm", key(rawKey), Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(data, "hex")), decipher.final()]).toString("utf8");
}
