/** Largest image the proxy will pass through. */
export const MAX_PROXY_BYTES = 10 * 1024 * 1024;

/**
 * Whether the image proxy may fetch `raw`: a public http(s) URL only, never
 * localhost or a private network address, so the proxy can't be used to
 * reach anything inside our network. (Hostnames are judged as written; DNS
 * pointing a public name inward is out of scope for an image proxy.)
 */
export function proxyableUrl(raw: string | null): URL | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return null;
  if (/^(0|10|127)\./.test(host) || host.startsWith("169.254.") || host.startsWith("192.168.")) return null;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) return null;
  if (host.includes(":") && (host === "::1" || host === "::" || /^f[cd]/.test(host) || host.startsWith("fe80") || host.startsWith("::ffff:"))) return null;
  return url;
}
