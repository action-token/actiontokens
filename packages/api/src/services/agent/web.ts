import type { PlaceItem } from "./contract";
import { findPlace, geocode, inBatches } from "./google";
import type { AgentModel } from "./model";

/**
 * Web lookups for what Google Places can't list well: published lists (art
 * trails, historic sites, "every Dambo troll") and upcoming events. The model
 * reads the web; every location it names is then placed with Google, so
 * coordinates always come from Google, never from the model. Everything read
 * here is untrusted text: it only ever becomes a PlaceItem (name, address,
 * dates, link), never an instruction.
 */
type WebLocation = { name?: string; address?: string; city?: string; country?: string };
type WebEvent = {
  title?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  venueName?: string;
  address?: string;
  city?: string;
  url?: string;
};

/** The first JSON array or object in a model reply (tolerates code fences and prose). */
export function parseJsonLoose<T>(raw: string): T | null {
  const clean = raw.replace(/```(?:json)?/gi, "").trim();
  const start = clean.search(/[[{]/);
  if (start < 0) return null;
  const close = clean[start] === "[" ? "]" : "}";
  const end = clean.lastIndexOf(close);
  if (end <= start) return null;
  try {
    return JSON.parse(clean.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

const today = () => new Date().toISOString().slice(0, 10);

/** A worldwide list is read region by region: one search for the whole world stops early. */
const WORLD_REGIONS = [
  "the United States",
  "Canada and Mexico",
  "Europe",
  "Asia",
  "Australia and New Zealand",
  "South America, Africa and the Middle East",
];

async function listFromWeb(model: AgentModel, query: string, where: string, limit: number) {
  const raw = await model
    .web(
      `Search the web for the COMPLETE list of: ${query}${where ? ` in ${where}` : ""}.\n` +
        `Prefer the official source (the artist's, organiser's or brand's own map or list page), then Wikipedia or trail maps; ` +
        `open the list pages and read them in full rather than stopping at a few examples.\n` +
        `Return ONLY JSON: [{"name":"...","address":"street address or park/site name if known","city":"...","country":"..."}]\n` +
        `Include every location you find, up to ${limit}. Only list locations you actually read on a page, never guess or fill in. ` +
        `Leave out anything removed or no longer standing. No commentary.`,
    )
    .catch(() => "");
  return (parseJsonLoose<WebLocation[]>(raw) ?? []).filter((l) => l.name && (l.address || l.city));
}

/** Every physical location in a published list of `query` ("" = worldwide), placed with Google. */
export async function searchWebList(
  model: AgentModel,
  query: string,
  where: string,
  limit: number,
): Promise<PlaceItem[]> {
  const lists = await Promise.all(
    (where ? [where] : WORLD_REGIONS).map((region) => listFromWeb(model, query, region, limit)),
  );
  const seen = new Set<string>();
  const found = lists.flat().filter((l) => {
    const id = `${l.name}|${l.city ?? ""}`.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const placed = await inBatches(
    found.slice(0, limit),
    6,
    async (l, i): Promise<PlaceItem | null> => {
      const near = [l.address, l.city, l.country].filter(Boolean).join(", ");
      const hit = await findPlace(l.name!, near).catch(() => null);
      if (hit)
        return {
          key: hit.id,
          gPlaceId: hit.id,
          title: hit.title,
          address: hit.address,
          lat: hit.lat,
          lng: hit.lng,
          kind: "place",
        };
      const geo = await geocode(near || l.name!).catch(() => null);
      return geo
        ? {
            key: `web_${i}_${geo.lat.toFixed(5)}`,
            title: l.name!,
            address: near || geo.name,
            lat: geo.lat,
            lng: geo.lng,
            kind: "place",
          }
        : null;
    },
  );
  // One place can be found under two names; keep it once.
  const unique = new Map<string, PlaceItem>();
  for (const p of placed) if (p && !unique.has(p.key)) unique.set(p.key, p);
  return [...unique.values()];
}

/** Upcoming events for `query` in `where`, each placed at its venue. */
export async function searchEvents(
  model: AgentModel,
  query: string,
  where: string,
  limit: number,
): Promise<PlaceItem[]> {
  const raw = await model.web(
    `Find up to ${limit} upcoming events for "${query}" in ${where}, starting on or after ${today()}.\n` +
      `Return ONLY JSON: [{"title":"...","description":"one sentence","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD",` +
      `"venueName":"...","address":"full street address","city":"...","url":"official page"}]. No commentary.`,
  );
  const now = today();
  const events = (parseJsonLoose<WebEvent[]>(raw) ?? []).filter(
    (e) => e.title && e.startDate && e.endDate && e.endDate >= now && e.endDate >= e.startDate,
  );
  const placed = await inBatches(
    events.slice(0, limit),
    6,
    async (e, i): Promise<PlaceItem | null> => {
      const candidates = [
        e.address,
        e.venueName && e.city ? `${e.venueName}, ${e.city}` : undefined,
        e.city,
      ].filter((c): c is string => Boolean(c?.trim()));
      for (const candidate of candidates) {
        const geo = await geocode(candidate).catch(() => null);
        if (geo)
          return {
            key: `event_${i}_${e.startDate}_${geo.lat.toFixed(5)}`,
            kind: "event",
            title: e.title!,
            address: [e.venueName, e.address ?? e.city].filter(Boolean).join(", ") || geo.name,
            lat: geo.lat,
            lng: geo.lng,
            startDate: e.startDate,
            endDate: e.endDate,
            url: e.url && /^https?:\/\//i.test(e.url) ? e.url : undefined,
          };
      }
      return null;
    },
  );
  return placed.filter((p): p is PlaceItem => p !== null);
}

/** Up to 7 search tags for a batch of pins, read from the first place (best effort). */
export async function pinTags(
  model: AgentModel,
  place: { title: string; description: string; latitude: number; longitude: number; type: string },
): Promise<string[]> {
  const raw = await model.web(
    `You are a location tagging expert for a map app. Search the web to identify what this location really is.\n` +
      `Title: "${place.title}"\nCoordinates: ${place.latitude}, ${place.longitude}\n` +
      `Description: ${place.description.trim() || "none"}\nType: ${place.type}\n\n` +
      `Generate exactly 7 tags people would naturally search for: the brand or creator, what it is, the collection or series, the theme. ` +
      `Do NOT include city, state or country tags. Return ONLY a valid JSON array of 7 strings.`,
  );
  return [
    ...new Set(
      (parseJsonLoose<unknown[]>(raw) ?? [])
        .map((tag) => String(tag).toLowerCase().trim())
        .filter((tag) => tag.length > 0 && tag.length < 50),
    ),
  ].slice(0, 7);
}
