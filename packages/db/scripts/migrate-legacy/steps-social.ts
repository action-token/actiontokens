import type { Copier, Row } from "./copier";
import { mediaType, notificationType } from "./map";

export async function copyPosts(copy: Copier) {
  await copy.insert(
    "posts",
    (await copy.read(`SELECT * FROM "PostGroup" ORDER BY id`)).map((post: Row) => {
      const tierId = copy.find("Subscription", post.subscriptionId);
      return {
        id: copy.map("PostGroup", post.id),
        organizationId: copy.must("Creator", post.creatorId),
        title: post.heading,
        body: post.content,
        summary: post.description,
        audience: tierId ? "MEMBERS" : "EVERYONE",
        tierId,
        facebookPostId: post.fbPostId,
        isImportOnly: post.importOnly,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
      };
    }),
  );

  const order = new Map<string, number>();
  const media: Row[] = [];
  for (const row of await copy.read(`SELECT * FROM "Media" ORDER BY id`)) {
    const postId = copy.find("PostGroup", row.postGroupId);
    if (!postId) {
      copy.skip("Media", row.id, "not attached to a post");
      continue;
    }
    const sortOrder = order.get(postId) ?? 0;
    order.set(postId, sortOrder + 1);
    media.push({
      id: copy.map("Media", row.id),
      postId,
      type: mediaType(row.type),
      url: row.url,
      title: row.title,
      artistName: row.artist,
      albumName: row.album,
      thumbnailUrl: row.thumbnail,
      durationSec: row.duration,
      sortOrder,
    });
  }
  await copy.insert("post_media", media);

  const collected = new Map((await copy.read("PostCollection")).map((c) => [Number(c.postId), c]));
  await copy.insert(
    "post_collectibles",
    (await copy.read(`SELECT * FROM "Post" ORDER BY id`)).map((copyOfPost: Row) => {
      const who = collected.get(Number(copyOfPost.id));
      return {
        id: copy.map("Post", copyOfPost.id),
        postId: copy.must("PostGroup", copyOfPost.postGroupId),
        collectorId: who ? copy.must("User", who.userId) : null,
        collectedAt: who?.collectedAt ?? null,
        createdAt: copyOfPost.createdAt,
      };
    }),
  );

  const likes: Row[] = [];
  for (const like of await copy.read("Like")) {
    if (like.status === false) {
      copy.skip("Like", like.id, "un-liked");
      continue;
    }
    likes.push({
      userId: copy.must("User", like.userId),
      postId: copy.must("PostGroup", like.postGroupId),
      createdAt: like.createdAt,
    });
  }
  await copy.insert("post_likes", likes);

  // Parents first, so a reply can point at its comment.
  await copy.insert(
    "post_comments",
    (await copy.read(`SELECT * FROM "Comment" ORDER BY "parentCommentID" NULLS FIRST, id`)).map(
      (comment: Row) => ({
        id: copy.map("Comment", comment.id),
        postId: copy.must("PostGroup", comment.postGroupId),
        authorId: copy.must("User", comment.userId),
        parentId: copy.find("Comment", comment.parentCommentID),
        body: comment.content,
        createdAt: comment.createdAt,
      }),
    ),
  );
}

/** Old notification targets are numbers or strings: the ones that still mean something carry over. */
function entityOf(copy: Copier, event: Row) {
  if (event.entityStringId) return String(event.entityStringId);
  if (event.entityId === null) return null;
  if (["POST", "LIKE", "COMMENT", "REPLY"].includes(event.entityType))
    return copy.find("PostGroup", event.entityId);
  return String(event.entityId);
}

export async function copyNotifications(copy: Copier) {
  await copy.insert(
    "notification_events",
    (await copy.read("NotificationObject")).map((event: Row) => ({
      id: copy.map("NotificationObject", event.id),
      type: notificationType(event.entityType),
      actorId: copy.must("User", event.actorId),
      entityId: entityOf(copy, event),
      createdAt: event.createdAt,
    })),
  );
  await copy.insert(
    "notifications",
    (await copy.read("Notification")).map((row: Row) => ({
      id: copy.map("Notification", row.id),
      eventId: copy.must("NotificationObject", row.notificationObjectId),
      recipientId: copy.must("User", row.notifierId),
      isForArtist: row.isCreator,
      seenAt: row.seen,
      createdAt: row.createdAt,
    })),
  );
}
