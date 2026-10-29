import { site } from "../site";

/**
 * What a pin spot's printed QR code holds: a link to the AR app's scan screen
 * with the spot's id. The scan screen collects from it (`pins.collectByQr`),
 * so scanning with a phone's own camera works too, with no app or location.
 */
export const pinScanUrl = (spotId: string) =>
  `${site.urls.arWeb.replace(/\/$/, "")}/scan?pin=${encodeURIComponent(spotId)}`;
