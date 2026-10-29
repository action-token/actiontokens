import QRCode from "qrcode";

import { pinScanUrl } from "@bandcoin/ar-core/ar/qr";

export type QrFormat = "svg" | "png";

export type RenderedQr = { base64: string; contentType: string; extension: QrFormat; scanUrl: string };

const utf8ToBase64 = (text: string) => btoa(unescape(encodeURIComponent(text)));

/** One spot's printable QR, drawn in the browser: SVG for any size, PNG at 512px. The code holds only the spot's scan link. */
export async function renderQr(spotId: string, format: QrFormat): Promise<RenderedQr> {
  const scanUrl = pinScanUrl(spotId);
  if (format === "png") {
    const dataUrl = await QRCode.toDataURL(scanUrl, { width: 512, margin: 2, errorCorrectionLevel: "M" });
    return { base64: dataUrl.slice(dataUrl.indexOf(",") + 1), contentType: "image/png", extension: "png", scanUrl };
  }
  const svg = await QRCode.toString(scanUrl, { type: "svg", margin: 2, errorCorrectionLevel: "M" });
  return { base64: utf8ToBase64(svg), contentType: "image/svg+xml", extension: "svg", scanUrl };
}
