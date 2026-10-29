/** Links on an artist's page open in the visitor's browser, so only plain web addresses are allowed (never javascript: or data:). */
export function safeUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export type VideoEmbed = {
  provider: "youtube" | "vimeo";
  id: string;
  embedUrl: string;
  watchUrl: string;
};

const YOUTUBE_ID = /^[\w-]{11}$/;
const VIMEO_ID = /^\d{5,12}$/;

/** A YouTube or Vimeo address as a privacy-friendly embed, or null for anything else. */
export function videoEmbed(value: unknown): VideoEmbed | null {
  const href = safeUrl(value);
  if (!href) return null;
  const url = new URL(href);
  const host = url.hostname.replace(/^www\.|^m\./, "");

  let youtube: string | null = null;
  if (host === "youtu.be") youtube = url.pathname.split("/")[1] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    youtube =
      url.pathname === "/watch"
        ? url.searchParams.get("v")
        : parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live"
          ? (parts[1] ?? null)
          : null;
  }
  if (youtube && YOUTUBE_ID.test(youtube)) {
    return {
      provider: "youtube",
      id: youtube,
      embedUrl: `https://www.youtube-nocookie.com/embed/${youtube}`,
      watchUrl: `https://www.youtube.com/watch?v=${youtube}`,
    };
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = url.pathname
      .split("/")
      .filter(Boolean)
      .find((part) => VIMEO_ID.test(part));
    if (id)
      return {
        provider: "vimeo",
        id,
        embedUrl: `https://player.vimeo.com/video/${id}?dnt=1`,
        watchUrl: `https://vimeo.com/${id}`,
      };
  }
  return null;
}
