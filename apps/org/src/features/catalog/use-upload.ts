"use client";

import { useState } from "react";

import { api } from "~/trpc/react";
import { declare, putToStorage } from "~/lib/upload";

/** Uploads a picked file straight to storage and gives back its public address. */
export function useUpload() {
  const sign = api.catalog.upload.useMutation();
  const [busy, setBusy] = useState(false);

  async function upload(file: File): Promise<string> {
    setBusy(true);
    try {
      const declared = await declare(file);
      const signed = await sign.mutateAsync(declared);
      await putToStorage(file, signed, declared.checksum);
      return signed.fileUrl;
    } finally {
      setBusy(false);
    }
  }
  return { upload, busy };
}
