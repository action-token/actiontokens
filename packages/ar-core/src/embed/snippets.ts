import { site } from "../site";
import { ALL_PIN_TYPES, PIN_TYPE_LABEL } from "./config";
import type { ArPinType } from "../ar/types";

/**
 * ── Website map: what the artist portal's editor works with ────────────────
 *
 * The editor's draft, the snippets an artist pastes onto their site, and the
 * preview link. The map is served by the AR app, so every link points there.
 */
export interface EmbedDraft {
  name: string;
  isEnabled: boolean;
  centerLat: number;
  centerLng: number;
  zoom: number;
  showUserLocation: boolean;
  gestureMode: "COOPERATIVE" | "GREEDY";
  theme: "AUTO" | "LIGHT" | "DARK";
  accentColor: string;
  pinSource: "ALL" | "ARTIST";
  pinTypes: ArPinType[];
  showFilterChips: boolean;
  showSearch: boolean;
  showNearby: boolean;
  showMurals: boolean;
  eventsLabel: string;
  eventsUrl: string | null;
  bountiesLabel: string;
  bountiesUrl: string | null;
  allowedDomains: string[];
}

export { ALL_PIN_TYPES, PIN_TYPE_LABEL };

export const arOrigin = () => site.urls.arWeb.replace(/\/$/, "");

export const DEFAULT_DRAFT: EmbedDraft = {
  name: "Website map",
  isEnabled: true,
  centerLat: 39.5,
  centerLng: -98.35,
  zoom: 3.5,
  showUserLocation: false,
  gestureMode: "COOPERATIVE",
  theme: "AUTO",
  accentColor: site.colors.embedAccent,
  pinSource: "ARTIST",
  pinTypes: [],
  showFilterChips: false,
  showSearch: true,
  showNearby: true,
  showMurals: true,
  eventsLabel: "Find events",
  eventsUrl: `${arOrigin()}/events`,
  bountiesLabel: "View bounties",
  bountiesUrl: `${arOrigin()}/bounty`,
  allowedDomains: [],
};

/** The editor's unsaved settings as the `c` param the AR app's preview reads. `organizationId` is whose pins "Only my pins" shows. */
export function previewUrl(draft: EmbedDraft, organizationId: string | null) {
  const json = JSON.stringify({ ...draft, organizationId });
  const b64 = btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${arOrigin()}/embed/preview?c=${b64}`;
}

export const embedPageUrl = (id: string) => `${arOrigin()}/embed/${id}`;

export const scriptSnippet = (id: string, height = 520) =>
  `<div data-actiontokens-embed="${id}" style="height:${height}px"></div>\n<script async src="${arOrigin()}/embed.js"></script>`;

export const iframeSnippet = (id: string, height = 520) =>
  `<iframe src="${embedPageUrl(id)}" title="${site.name} map" width="100%" height="${height}" style="border:0;display:block" loading="lazy" allow="geolocation"></iframe>`;

/** A hero section with the map behind the page's own heading and buttons. */
export const heroSnippet = (
  id: string,
) => `<section style="position:relative;height:560px;overflow:hidden">
  <div data-actiontokens-embed="${id}" style="position:absolute;inset:0"></div>
  <div style="position:relative;z-index:1;pointer-events:none;padding:48px">
    <h1 style="pointer-events:auto">Find us on tour</h1>
  </div>
</section>
<script async src="${arOrigin()}/embed.js"></script>`;
