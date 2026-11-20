/**
 * A same-site path to send the browser back to, with Last.fm's result flags
 * cleared (and `flag` set). Anything that isn't a local path becomes `fallback`,
 * so the redirect can't be pointed at another site.
 */
export function backTo(raw: string | null, fallback: string, flag?: [string, string]) {
  const path = raw?.startsWith("/") && !raw.startsWith("//") ? raw : fallback;
  const url = new URL(path, "http://local");
  url.searchParams.delete("lastfm");
  url.searchParams.delete("error");
  if (flag) url.searchParams.set(...flag);
  return `${url.pathname}${url.search}${url.hash}`;
}
