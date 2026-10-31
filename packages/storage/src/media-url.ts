import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { getBucketName, getS3Client } from "./bucket";

/** Long enough to finish a track and seek around, short enough that a shared link dies. */
const MEDIA_URL_TTL_SECONDS = 60 * 60;

/**
 * The one place media files get a playable URL: a signed GET on the private
 * bucket. Swapping in CloudFront or R2 later only changes this function.
 */
export function signedMediaUrl(key: string, ttlSeconds = MEDIA_URL_TTL_SECONDS) {
  return getSignedUrl(getS3Client(), new GetObjectCommand({ Bucket: getBucketName(), Key: key }), {
    expiresIn: ttlSeconds,
  });
}

/** Stores a file the worker made (stream, preview, waveform) under a private key, streamed from disk. */
export async function putMediaFile(key: string, path: string, contentType: string) {
  const { size } = await stat(path);
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      Body: createReadStream(path),
      ContentLength: size,
      ContentType: contentType,
    }),
  );
}
