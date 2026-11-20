import type { Copier, Row } from "./copier";
import { dec, mediaType } from "./map";

/** Actionverse communities: integer ids become cuids; every row keeps its relations and dates. */
export async function copyCommunities(copy: Copier) {
  const owners = new Map<number, string>();
  await copy.insert(
    "communities",
    (await copy.read(`SELECT * FROM "Community" ORDER BY id`)).map((row: Row) => {
      owners.set(row.id, row.ownerId);
      return {
        id: copy.map("Community", row.id),
        ownerId: copy.must("User", row.ownerId),
        title: row.title,
        description: row.description,
        coverUrl: row.coverUrl,
        profileUrl: row.profileUrl,
        memberListVisibility: row.memberListVisibility,
        postPermission: row.postPermission,
        isTokenGated: row.isTokenGated,
        gateLogic: row.tokenGateLogic === "OR" ? "OR" : "AND",
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    }),
  );
  await copy.insert(
    "community_token_requirements",
    (await copy.read("CommunityTokenRequirement")).map((row: Row) => ({
      id: copy.map("CommunityTokenRequirement", row.id),
      communityId: copy.must("Community", row.communityId),
      assetCode: row.assetCode,
      assetIssuer: row.assetIssuer,
      assetImageUrl: row.assetImage,
      requiredBalance: dec(row.requiredBalance),
      createdAt: row.createdAt,
    })),
  );
  await copy.insert(
    "community_members",
    (await copy.read("CommunityMember")).map((row: Row) => ({
      id: copy.map("CommunityMember", row.id),
      communityId: copy.must("Community", row.communityId),
      userId: copy.must("User", row.userId),
      role: row.role,
      joinedAt: row.joinedAt,
    })),
  );
  await copy.insert(
    "community_posts",
    (await copy.read(`SELECT * FROM "CommunityPost" ORDER BY id`)).map((row: Row) => ({
      id: copy.map("CommunityPost", row.id),
      communityId: copy.must("Community", row.communityId),
      authorId: copy.must("User", row.authorId),
      content: row.content,
      commentsEnabled: row.commentsEnabled,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
  );
  const order = new Map<string, number>();
  await copy.insert(
    "community_post_media",
    (await copy.read(`SELECT * FROM "CommunityPostMedia" ORDER BY id`)).map((row: Row) => {
      const postId = copy.must("CommunityPost", row.postId);
      const sortOrder = order.get(postId) ?? 0;
      order.set(postId, sortOrder + 1);
      return {
        id: copy.map("CommunityPostMedia", row.id),
        postId,
        type: mediaType(row.type),
        url: row.url,
        sortOrder,
      };
    }),
  );
  await copy.insert(
    "community_post_likes",
    (await copy.read("CommunityPostLike")).map((row: Row) => ({
      id: copy.map("CommunityPostLike", row.id),
      postId: copy.must("CommunityPost", row.postId),
      userId: copy.must("User", row.userId),
      createdAt: row.createdAt,
    })),
  );
  // Parents first, so a reply can point at its comment.
  await copy.insert(
    "community_comments",
    (
      await copy.read(`SELECT * FROM "CommunityComment" ORDER BY "parentCommentId" NULLS FIRST, id`)
    ).map((row: Row) => ({
      id: copy.map("CommunityComment", row.id),
      postId: copy.must("CommunityPost", row.postId),
      authorId: copy.must("User", row.userId),
      parentId: copy.find("CommunityComment", row.parentCommentId),
      body: row.content,
      createdAt: row.createdAt,
    })),
  );
  await copy.insert(
    "community_activities",
    (await copy.read(`SELECT * FROM "CommunityActivity" ORDER BY id`)).map((row: Row) => {
      const post = ["POST_CREATED", "POST_LIKED"].includes(row.type);
      const comment = row.type === "COMMENT_CREATED";
      return {
        id: copy.map("CommunityActivity", row.id),
        communityId: copy.must("Community", row.communityId),
        actorId: copy.must("User", row.actorId),
        type: row.type,
        entityId: post
          ? copy.find("CommunityPost", row.entityId)
          : comment
            ? copy.find("CommunityComment", row.entityId)
            : null,
        createdAt: row.createdAt,
      };
    }),
  );
  await copy.insert(
    "community_notification_preferences",
    (await copy.read("CommunityNotificationPreference")).map((row: Row) => ({
      id: copy.map("CommunityNotificationPreference", row.id),
      communityId: copy.must("Community", row.communityId),
      userId: copy.must("User", row.userId),
      newPosts: row.newPosts,
      newComments: row.newComments,
      newMembers: row.newMembers,
      reactions: row.reactions,
    })),
  );
}
