import { AppError, ErrorCodes } from "@actiontokens/errors";

/** The base64 SHA-256 of a file: the presigned upload only accepts exactly this file. */
export async function sha256Base64(file: Blob) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
  return btoa(String.fromCharCode(...digest));
}

/** Browsers send no type for some files (.glb, .obj); storage takes those as plain bytes. */
const typeOf = (file: File) => file.type || "application/octet-stream";

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
