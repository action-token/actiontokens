"use client";

import { useCallback, useState } from "react";
import toast from "react-hot-toast";

import {
  buildSheetHtml,
  base64ToBytes,
  printHtml,
  qrFilename,
  saveBlob,
  slugify,
  type SheetCode,
} from "./print";
import { renderQr, type QrFormat } from "./qr-codes";
import { buildZip } from "./zip";

/** Most codes one zip or print sheet holds. */
export const MAX_QR_CODES = 100;

export type QrPin = { id: string; title: string; spots: { id: string }[] };

/**
 * Bulk actions for one pin: every spot's code as a zip, or as a print sheet.
 * Shared by the list row and the dialog so "print all 12" can't mean two
 * slightly different things.
 */
export function usePinQrs({
  pin,
  artistName,
  format = "svg",
}: {
  pin: QrPin;
  artistName: string;
  format?: QrFormat;
}) {
  const [isPending, setPending] = useState(false);
  const spots = pin.spots.slice(0, MAX_QR_CODES);
  const truncated = pin.spots.length > MAX_QR_CODES;
  const render = useCallback(
    () => Promise.all(spots.map((spot) => renderQr(spot.id, format))),
    [spots, format],
  );

  /** One zip, one file: not N downloads, which browsers gate behind a permission prompt. */
  const downloadAll = useCallback(async () => {
    setPending(true);
    try {
      const codes = await render();
      const zip = buildZip(
        codes.map((code, i) => ({
          name: qrFilename(
            pin,
            { spotId: spots[i]!.id, pinNumber: spots.length > 1 ? i + 1 : null },
            code.extension,
          ),
          data: base64ToBytes(code.base64),
        })),
      );
      saveBlob(zip, `${slugify(pin.title, 40)}-qr-codes.zip`, "application/zip");
      toast.success(`${codes.length} QR codes downloaded`);
      if (truncated)
        toast(`That pin has more than ${MAX_QR_CODES} spots, so the rest weren't included`, {
          icon: "⚠️",
        });
    } finally {
      setPending(false);
    }
  }, [render, pin, spots, truncated]);

  /** The print sheet: one page, N stickers, cut lines included. */
  const printAll = useCallback(async () => {
    setPending(true);
    try {
      const codes = await render();
      const sheet: SheetCode[] = codes.map((code, i) => ({
        src: `data:${code.contentType};base64,${code.base64}`,
        caption: spots.length > 1 ? `${pin.title} · Spot ${i + 1} of ${spots.length}` : pin.title,
        artist: artistName,
      }));
      printHtml(buildSheetHtml(sheet, { title: pin.title, columns: 3 }));
      if (truncated) toast(`Only the first ${MAX_QR_CODES} spots fit on one sheet`, { icon: "⚠️" });
    } finally {
      setPending(false);
    }
  }, [render, pin.title, spots.length, artistName, truncated]);

  return { downloadAll, printAll, isPending };
}
