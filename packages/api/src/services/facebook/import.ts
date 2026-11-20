import { fetchPublicFile, uploadBufferToS3 } from "@actiontokens/storage";

import type { Context } from "../../context";
import { notifyFollowers } from "../notifications/send";
import { enqueueJob } from "../jobs/queue";
import {
  attachmentsOf,
  firstLine,
  getPagePost,
  GraphApiError,
  openToken,
  type FbPost,
  verifyWebhookSignature,
} from "./graph";

/**
 * Copying a Facebook page post into Bandcoin, once. The webhook only says
 * "this post was added": it is queued as a job (Meta wants a fast answer), and
 * the worker fetches the post, re-hosts its photos and videos in our storage
 * and creates the post. As in the old app, an imported post shows in the feed
 * but has no collectible copies.
 */
type ServiceCtx = Pick<Context, "db" | "activity">;

export const FACEBOOK_IMPORT_JOB = "facebook.import";
const SUPPORTED_ITEMS = ["status", "photo", "video", "share", "post"];
const MAX_MEDIA = 10;

export type ImportPayload = {
  fbPostId: string;
  /** What the webhook itself carried, used only if Facebook won't give the post back */
  fallback?: { message?: string; photos?: string[]; link?: string; createdTime?: number | string };
};

type WebhookPayload = {
  object?: string;
  entry?: {
    id?: string | number;
    changes?: {
      field?: string;
      value?: {
        item?: string;
        verb?: string;
        post_id?: string;
        postId?: string;
        id?: string;
        message?: string;
        link?: string;
        photos?: string[];
        created_time?: number | string;
      };
    }[];
  }[];
};

/** Checks Meta's signature, then queues one import per new post on a connected page. */
export async function receiveWebhook(
  ctx: Pick<ServiceCtx, "db">,
  rawBody: string,
  signature: string | null,
) {
  if (!verifyWebhookSignature(rawBody, signature)) return { ok: false as const, status: 401 };
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return { ok: false as const, status: 400 };
  }
  let queued = 0;
  if (payload.object === "page")
    for (const entry of payload.entry ?? []) {
      const pageId = String(entry.id ?? "");
      const connection = await ctx.db.facebookConnection.findFirst({
        where: { pageId },
        select: { artistId: true },
      });
      if (!connection) continue;
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (change.field !== "feed" || value?.verb !== "add") continue;
        if (value.item && !SUPPORTED_ITEMS.includes(value.item)) continue;
        const fbPostId =
          value.post_id ?? value.postId ?? (value.id ? `${pageId}_${value.id}` : null);
        if (!fbPostId) continue;
        await enqueueJob(
          ctx.db,
          FACEBOOK_IMPORT_JOB,
          {
            artistId: connection.artistId,
            fbPostId,
            fallback: {
              message: value.message,
              photos: Array.isArray(value.photos) ? value.photos : value.link ? [value.link] : [],
              link: value.link,
              createdTime: value.created_time,
            },
          } as never,
          // The same post sent twice is one job, and an import can be repeated safely.
          { dedupe: true },
        );
        queued += 1;
      }
    }
  return { ok: true as const, status: 200, queued };
}

const createdAtOf = (post: FbPost | null, fallback?: ImportPayload["fallback"]) => {
  if (post?.created_time) return new Date(post.created_time);
  const time = fallback?.createdTime;
  if (time === undefined) return new Date();
  return new Date(typeof time === "number" && time < 1e12 ? time * 1000 : time);
};

/** The worker's `facebook.import`. Returns what happened; only a lost token or a missing artist stops it. */
export async function importFacebookPost(
  ctx: ServiceCtx,
  artistId: string,
  input: ImportPayload,
  deps: {
    getPost?: typeof getPagePost;
    download?: typeof fetchPublicFile;
    upload?: typeof uploadBufferToS3;
  } = {},
) {
  const { fbPostId, fallback } = input;
  if (await ctx.db.post.findUnique({ where: { facebookPostId: fbPostId }, select: { id: true } }))
    return { outcome: "DUPLICATE" as const };

  const artist = await ctx.db.artist.findUnique({
    where: { id: artistId },
    select: { id: true, userId: true, facebook: { select: { pageTokenEncrypted: true } } },
  });
  if (!artist?.facebook) return { outcome: "DISCONNECTED" as const };

  let post: FbPost | null = null;
  try {
    post = await (deps.getPost ?? getPagePost)(
      openToken(artist.facebook.pageTokenEncrypted),
      fbPostId,
    );
  } catch (error) {
    if (error instanceof GraphApiError && error.tokenRevoked) {
      // They removed our access on Facebook: the connection can't work again.
      await ctx.db.facebookConnection.delete({ where: { artistId } }).catch(() => undefined);
      return { outcome: "TOKEN_REVOKED" as const };
    }
    // Anything else: use what the webhook carried, if it carried enough.
  }

  const sources: { url: string; video: boolean }[] = [];
  if (post) {
    for (const item of attachmentsOf(post)) {
      const video =
        item.type === "video" || item.type === "video_inline" || item.media_type === "VIDEO";
      const url = (video ? item.media?.source : item.media?.image?.src) ?? item.url;
      if (url) sources.push({ url, video });
    }
  } else for (const url of fallback?.photos ?? []) sources.push({ url, video: false });

  const media: { type: "IMAGE" | "VIDEO"; url: string }[] = [];
  for (const source of sources.slice(0, MAX_MEDIA)) {
    try {
      const file = await (deps.download ?? fetchPublicFile)(source.url);
      const kind = file.contentType.startsWith("video/")
        ? "VIDEO"
        : file.contentType.startsWith("image/")
          ? "IMAGE"
          : null;
      if (!kind) continue;
      media.push({
        type: kind,
        url: await (deps.upload ?? uploadBufferToS3)(file.bytes, file.contentType, {
          keyPrefix: "facebook-",
          placement: { owner: "artists", ownerId: artistId, kind: "facebook" },
        }),
      });
    } catch {
      // One photo that won't copy doesn't stop the post.
    }
  }

  const message = (post?.message ?? post?.story ?? fallback?.message ?? "").trim();
  const link = post?.permalink_url ?? fallback?.link ?? null;
  if (!message && media.length === 0) return { outcome: "EMPTY" as const };

  const created = await ctx.db.post.create({
    data: {
      artistId,
      title: firstLine(message) || "Facebook update",
      body: [message, link].filter(Boolean).join("\n\n"),
      facebookPostId: fbPostId,
      createdAt: createdAtOf(post, fallback),
      media: {
        createMany: {
          data: media.map((m, index) => ({ type: m.type, url: m.url, sortOrder: index })),
        },
      },
    },
    select: { id: true },
  });
  ctx.activity.set({ targetType: "Post", targetId: created.id });
  await notifyFollowers(ctx, {
    type: "POST",
    artist: { id: artist.id, userId: artist.userId },
    entityId: created.id,
  });
  return { outcome: "IMPORTED" as const, postId: created.id, media: media.length };
}
