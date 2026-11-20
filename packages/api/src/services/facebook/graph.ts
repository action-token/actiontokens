import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { AppError, ErrorCodes } from "@actiontokens/errors";

/**
 * Facebook's Graph API, server side only. The app id and secret, the key that
 * seals page tokens and the webhook secret all come from the environment and
 * never reach a browser.
 */
const version = () => process.env.FACEBOOK_GRAPH_VERSION ?? "v25.0";
const graph = () => `https://graph.facebook.com/${version()}`;

const need = (name: string) => {
  const value = process.env[name];
  if (!value)
    throw new AppError(ErrorCodes.CONFIG_MISSING, {
      message: "Facebook isn't set up yet.",
      details: { name },
    });
  return value;
};

export class GraphApiError extends Error {
  constructor(
    readonly status: number,
    readonly data: { error?: { message?: string; code?: number; error_subcode?: number } },
  ) {
    super(`Graph API ${status}: ${data.error?.message ?? "request failed"}`);
    this.name = "GraphApiError";
  }
  /** The person took away our access (or the token expired): it can't work again. */
  get tokenRevoked() {
    return (
      this.status === 401 || this.data.error?.code === 190 || this.data.error?.error_subcode === 458
    );
  }
}

async function call<T>(url: URL, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new GraphApiError(response.status, data);
  return data as T;
}

export function graphGet<T = Record<string, unknown>>(
  path: string,
  params: Record<string, string>,
) {
  const url = new URL(`${graph()}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return call<T>(url);
}

export function graphPost<T = Record<string, unknown>>(
  path: string,
  params: Record<string, string>,
) {
  return call<T>(new URL(`${graph()}${path}`), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
}

// ─── Sealing page tokens (AES-256-GCM, "iv:tag:data" in hex) ────────────────

function sealKey() {
  const hex = need("SOCIAL_TOKEN_ENC_KEY");
  if (!/^[0-9a-f]{64}$/i.test(hex))
    throw new AppError(ErrorCodes.CONFIG_MISSING, {
      message: "SOCIAL_TOKEN_ENC_KEY must be 64 hex characters.",
    });
  return Buffer.from(hex, "hex");
}

export function sealToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sealKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString("hex")).join(":");
}

export function openToken(sealed: string): string {
  const [iv, tag, data] = sealed.split(":");
  if (!iv || !tag || !data) throw new Error("Unknown token format");
  const decipher = createDecipheriv("aes-256-gcm", sealKey(), Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(data, "hex")), decipher.final()]).toString(
    "utf8",
  );
}

// ─── Webhook signature and the sign-in state ────────────────────────────────

/** Meta signs each webhook with the app secret: `X-Hub-Signature-256: sha256=<hex>`. */
export function verifyWebhookSignature(rawBody: string, header: string | null): boolean {
  const given = /^sha256=([0-9a-f]{64})$/i.exec(header ?? "")?.[1];
  const secret = process.env.FACEBOOK_APP_SECRET;
  if (!given || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return timingSafeEqual(Buffer.from(expected), Buffer.from(given.toLowerCase()));
}

const STATE_TTL_MS = 10 * 60_000;
const stateSignature = (payload: string) =>
  createHmac("sha256", sealKey()).update(payload).digest("hex");

/** The state sent to Facebook and back: who started it, when, and where to return. Signed, so it can't be forged. */
export function makeState(input: { artistId: string; redirect: string }, now = Date.now()) {
  const payload = Buffer.from(
    JSON.stringify({
      a: input.artistId,
      r: input.redirect,
      n: randomBytes(12).toString("hex"),
      t: now,
    }),
  ).toString("base64url");
  return `${payload}.${stateSignature(payload)}`;
}

export function readState(state: string | null | undefined, now = Date.now()) {
  const [payload, signature] = (state ?? "").split(".");
  if (!payload || !signature) return null;
  const expected = stateSignature(payload);
  if (
    expected.length !== signature.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  )
    return null;
  try {
    const { a, r, t } = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      a?: unknown;
      r?: unknown;
      t?: unknown;
    };
    if (typeof a !== "string" || typeof r !== "string" || typeof t !== "number") return null;
    return now - t > STATE_TTL_MS ? null : { artistId: a, redirect: r };
  } catch {
    return null;
  }
}

// ─── Signing in with Facebook, and the person's pages ───────────────────────

export function loginUrl(state: string) {
  const url = new URL(`https://www.facebook.com/${version()}/dialog/oauth`);
  url.searchParams.set("client_id", need("FACEBOOK_APP_ID"));
  url.searchParams.set("redirect_uri", need("FACEBOOK_REDIRECT_URI"));
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  const configId = process.env.NEXT_PUBLIC_FACEBOOK_CONFIG_ID;
  if (configId) url.searchParams.set("config_id", configId);
  else
    url.searchParams.set(
      "scope",
      "pages_show_list,pages_read_engagement,pages_read_user_content,pages_manage_metadata,business_management",
    );
  return url.toString();
}

/** The code Facebook sent back, turned into a long-lived user token (about 60 days). */
export async function userTokenFor(code: string) {
  const common = { client_id: need("FACEBOOK_APP_ID"), client_secret: need("FACEBOOK_APP_SECRET") };
  const short = await graphGet<{ access_token: string }>("/oauth/access_token", {
    ...common,
    code,
    redirect_uri: need("FACEBOOK_REDIRECT_URI"),
  });
  const long = await graphGet<{ access_token: string }>("/oauth/access_token", {
    ...common,
    grant_type: "fb_exchange_token",
    fb_exchange_token: short.access_token,
  }).catch(() => null);
  return long?.access_token ?? short.access_token;
}

export type FbPage = { id: string; name: string; access_token: string };

/** Pages the person manages: their own list, plus pages managed through a business. */
export async function listPages(userToken: string): Promise<FbPage[]> {
  const pages = new Map<string, FbPage>();
  let next: string | undefined =
    `${graph()}/me/accounts?fields=id,name,access_token&limit=100&access_token=${encodeURIComponent(userToken)}`;
  for (let round = 0; next && round < 10; round++) {
    const response = await fetch(next, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (!response?.ok) break;
    const data = (await response.json()) as {
      data?: { id: string; name: string; access_token?: string }[];
      paging?: { next?: string };
    };
    for (const page of data.data ?? [])
      if (page.id && page.name && page.access_token)
        pages.set(page.id, { id: page.id, name: page.name, access_token: page.access_token });
    next = data.paging?.next;
  }
  const businesses = await graphGet<{ data?: { id: string }[] }>("/me/businesses", {
    fields: "id",
    access_token: userToken,
  }).catch(() => ({ data: [] }));
  for (const business of businesses.data ?? [])
    for (const edge of ["owned_pages", "client_pages"]) {
      const found = await graphGet<{
        data?: { id: string; name: string; access_token?: string }[];
      }>(`/${encodeURIComponent(business.id)}/${edge}`, {
        fields: "id,name,access_token",
        access_token: userToken,
      }).catch(() => ({ data: [] }));
      for (const page of found.data ?? [])
        if (page.id && page.name && page.access_token && !pages.has(page.id))
          pages.set(page.id, { id: page.id, name: page.name, access_token: page.access_token });
    }
  return [...pages.values()];
}

export const subscribePage = (pageId: string, pageToken: string) =>
  graphPost(`/${encodeURIComponent(pageId)}/subscribed_apps`, {
    access_token: pageToken,
    subscribed_fields: "feed",
  });

export async function unsubscribePage(pageId: string, pageToken: string) {
  const url = new URL(`${graph()}/${encodeURIComponent(pageId)}/subscribed_apps`);
  url.searchParams.set("access_token", pageToken);
  await fetch(url, { method: "DELETE", signal: AbortSignal.timeout(15_000) }).catch(
    () => undefined,
  );
}

// ─── A page post ────────────────────────────────────────────────────────────

export type FbAttachment = {
  type?: string;
  media_type?: string;
  url?: string;
  media?: { image?: { src?: string }; source?: string };
};
export type FbPost = {
  id: string;
  message?: string;
  story?: string;
  created_time?: string;
  permalink_url?: string;
  full_picture?: string;
  attachments?: { data?: (FbAttachment & { subattachments?: { data?: FbAttachment[] } })[] };
};

export const getPagePost = (pageToken: string, postId: string) =>
  graphGet<FbPost>(`/${encodeURIComponent(postId)}`, {
    access_token: pageToken,
    fields:
      "message,story,created_time,permalink_url,full_picture," +
      "attachments{media_type,type,media,url,subattachments{media_type,type,media,url}}",
  });

/** Every photo or video of a post, an album's pictures one by one. */
export function attachmentsOf(post: FbPost): FbAttachment[] {
  const items: FbAttachment[] = [];
  for (const attachment of post.attachments?.data ?? []) {
    const subs = attachment.subattachments?.data;
    if (subs && subs.length > 0) items.push(...subs);
    else items.push(attachment);
  }
  if (items.length === 0 && post.full_picture)
    items.push({
      type: "photo",
      media_type: "IMAGE",
      media: { image: { src: post.full_picture } },
    });
  return items;
}

export const firstLine = (text?: string) =>
  (text?.trim().split("\n")[0] ?? "").slice(0, 100).trim();
