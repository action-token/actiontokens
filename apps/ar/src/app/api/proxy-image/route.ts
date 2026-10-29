import { MAX_PROXY_BYTES, proxyableUrl } from "~/lib/proxy-image";

/**
 * Re-serves a pin's image with CORS headers. The AR scene draws images into
 * a WebGL texture, which browsers refuse cross-origin unless the image host
 * allows it, and most hosts artists upload to don't.
 */
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };

export function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: { ...CORS, "Access-Control-Allow-Headers": "Content-Type" },
  });
}

export async function GET(request: Request) {
  const url = proxyableUrl(new URL(request.url).searchParams.get("url"));
  if (!url) return Response.json({ error: "That image address isn't allowed." }, { status: 400 });

  try {
    const response = await fetchAllowed(url);
    if (!response)
      return Response.json({ error: "That image address isn't allowed." }, { status: 400 });
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok)
      return Response.json({ error: "The image couldn't be loaded." }, { status: 502 });
    if (!type.startsWith("image/"))
      return Response.json({ error: "That address isn't an image." }, { status: 415 });
    if (Number(response.headers.get("content-length") ?? 0) > MAX_PROXY_BYTES) {
      return Response.json({ error: "The image is too large." }, { status: 413 });
    }
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_PROXY_BYTES)
      return Response.json({ error: "The image is too large." }, { status: 413 });
    return new Response(buffer, {
      headers: {
        ...CORS,
        "Content-Type": type,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return Response.json({ error: "The image couldn't be loaded." }, { status: 502 });
  }
}

/** Follows up to three redirects, checking every hop, since CDNs redirect but a hop could point inward. */
async function fetchAllowed(first: URL) {
  let url: URL | null = first;
  for (let hop = 0; url && hop < 4; hop++) {
    const response: Response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("location");
    url = location ? proxyableUrl(new URL(location, url).toString()) : null;
  }
  return null;
}
