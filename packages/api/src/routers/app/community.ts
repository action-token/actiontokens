import { z } from "zod";

import type { Db } from "@actiontokens/db";
import { AppError, ErrorCodes } from "@actiontokens/errors";

import { searchAssets } from "../../services/community/assets";
import { checkGate } from "../../services/community/gate";
import { notifyCommunity } from "../../services/community/notify";
import { authedProcedure, createRouter, publicProcedure } from "../../trpc";

/**
 * Communities: groups owned by a user, optionally gated by holding tokens. Members post, like and
 * comment; the owner manages the group. The token gate is checked here against the chain, never
 * from balances the browser sends. Community events go to the central notification system (services/community/notify).
 */

const PAGE = 20;
const MEDIA = z.enum(["AUDIO", "VIDEO", "IMAGE", "MODEL_3D", "DOCUMENT"]);
const userSelect = { id: true, username: true, displayName: true, avatarUrl: true } as const;

const requirementInput = z.object({
  assetCode: z.string().min(1).max(12),
  assetIssuer: z.string().length(56),
  assetImageUrl: z.string().url().nullish(),
  requiredBalance: z.number().min(0).default(0),
});
const communityFields = {
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(2000),
  coverUrl: z.string().url(),
  profileUrl: z.string().url(),
  memberListVisibility: z.enum(["EVERYONE", "MEMBERS_ONLY"]).default("EVERYONE"),
  postPermission: z.enum(["ALL_MEMBERS", "OWNER_ONLY"]).default("ALL_MEMBERS"),
  isTokenGated: z.boolean().default(false),
  gateLogic: z.enum(["AND", "OR"]).default("AND"),
  requirements: z.array(requirementInput).max(10).default([]),
};
const idInput = z.object({ communityId: z.string().min(1) });

const notFound = (what: string) =>
  new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: `This ${what} doesn't exist.` });
const refuse = (message: string) => new AppError(ErrorCodes.PRECONDITION_NOT_MET, { message });
const forbid = (message: string) => new AppError(ErrorCodes.AUTH_FORBIDDEN, { message });

async function communityOr404(db: Db, id: string) {
  const community = await db.community.findUnique({
    where: { id },
    include: { requirements: true },
  });
  if (!community) throw notFound("community");
  return community;
}

/** Hidden communities are for their owner only; anyone else gets "doesn't exist". */
async function visibleOr404(db: Db, communityId: string, viewerId?: string) {
  const community = await db.community.findUnique({
    where: { id: communityId },
    select: { id: true, ownerId: true, hiddenAt: true },
  });
  if (!community || (community.hiddenAt && community.ownerId !== viewerId))
    throw notFound("community");
  return community;
}

/** What can't be done in a hidden community, even by its owner. */
const notHidden = (community: { hiddenAt: Date | null }) => {
  if (community.hiddenAt) throw refuse("This community is hidden by the admins.");
};

async function membership(db: Db, communityId: string, userId: string) {
  return db.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId } },
  });
}

async function requireMember(db: Db, communityId: string, userId: string) {
  const member = await membership(db, communityId, userId);
  if (!member) throw forbid("Join the community first.");
  return member;
}

async function logActivity(
  db: Db,
  communityId: string,
  actorId: string,
  type: "JOIN" | "LEAVE" | "POST_CREATED" | "POST_LIKED" | "COMMENT_CREATED" | "MEMBER_INVITED",
  entityId?: string,
) {
  await db.communityActivity.create({ data: { communityId, actorId, type, entityId } });
}

/** Decimals don't survive the wire (superjson has no Decimal type): the required balance as text. */
function withPlainBalances<
  T extends { requirements: { requiredBalance: { toString(): string } }[] },
>(row: T) {
  return {
    ...row,
    requirements: row.requirements.map((req) => ({
      ...req,
      requiredBalance: req.requiredBalance.toString(),
    })),
  };
}

const communityRouter = createRouter({
  list: publicProcedure
    .input(
      z.object({
        search: z.string().trim().max(100).optional(),
        cursor: z.string().optional(),
        sort: z.enum(["newest", "members"]).default("newest"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.community.findMany({
        where: {
          hiddenAt: null,
          ...(input.search
            ? {
                OR: [
                  { title: { contains: input.search, mode: "insensitive" } },
                  { description: { contains: input.search, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy:
          input.sort === "members"
            ? [{ members: { _count: "desc" } }, { id: "asc" }]
            : [{ createdAt: "desc" }, { id: "asc" }],
        take: PAGE + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        include: {
          owner: { select: userSelect },
          requirements: { select: { assetCode: true, assetImageUrl: true, requiredBalance: true } },
          _count: { select: { members: true, posts: true } },
        },
      });
      const next = rows.length > PAGE ? rows.pop() : undefined;
      return { items: rows.map(withPlainBalances), nextCursor: next?.id ?? null };
    }),

  /** The biggest communities, for the discover screen. */
  trending: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(20).default(5) }))
    .query(async ({ ctx, input }) =>
      (
        await ctx.db.community.findMany({
          where: { hiddenAt: null },
          take: input.limit,
          orderBy: [{ members: { _count: "desc" } }, { id: "asc" }],
          include: {
            owner: { select: userSelect },
            requirements: {
              select: { assetCode: true, assetImageUrl: true, requiredBalance: true },
            },
            _count: { select: { members: true, posts: true } },
          },
        })
      ).map(withPlainBalances),
    ),

  /** Finds Stellar assets for the gate's token picker. */
  searchAssets: authedProcedure
    .input(z.object({ search: z.string().trim().min(1).max(50) }))
    .query(({ input }) => searchAssets(input.search)),

  /** People to invite: by name, username or email, leaving out the caller and current members. */
  searchUsers: authedProcedure
    .input(
      z.object({
        search: z.string().trim().max(50).optional(),
        communityId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const members = input.communityId
        ? await ctx.db.communityMember.findMany({
            where: { communityId: input.communityId },
            select: { userId: true },
          })
        : [];
      const exclude = [ctx.session.user.id, ...members.map((m) => m.userId)];
      const term = input.search && input.search.length >= 2 ? input.search : null;
      return ctx.db.user.findMany({
        where: {
          id: { notIn: exclude },
          ...(term
            ? {
                OR: [
                  { displayName: { contains: term, mode: "insensitive" } },
                  { username: { contains: term, mode: "insensitive" } },
                  { email: { equals: term, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        select: userSelect,
        orderBy: { createdAt: "desc" },
        take: PAGE,
      });
    }),

  /** A member invites people who aren't in yet; they get a notification. */
  invite: authedProcedure
    .input(idInput.extend({ userIds: z.array(z.string().min(1)).min(1).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      notHidden(await visibleOr404(ctx.db, input.communityId, userId));
      await requireMember(ctx.db, input.communityId, userId);
      const existing = await ctx.db.communityMember.findMany({
        where: { communityId: input.communityId, userId: { in: input.userIds } },
        select: { userId: true },
      });
      const inside = new Set(existing.map((m) => m.userId));
      const invited = [...new Set(input.userIds)].filter((id) => id !== userId && !inside.has(id));
      if (invited.length === 0) return { invited: 0 };
      await notifyCommunity(ctx, {
        type: "COMMUNITY_INVITE",
        actorId: userId,
        communityId: input.communityId,
        only: invited,
      });
      await logActivity(ctx.db, input.communityId, userId, "MEMBER_INVITED");
      return { invited: invited.length };
    }),

  mine: authedProcedure.query(({ ctx }) =>
    ctx.db.community.findMany({
      where: {
        members: { some: { userId: ctx.session.user.id } },
        OR: [{ hiddenAt: null }, { ownerId: ctx.session.user.id }],
      },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { members: true, posts: true } } },
    }),
  ),

  /** Communities the caller may post in: their own, plus ones that let every member post. */
  postable: authedProcedure.query(({ ctx }) =>
    ctx.db.community.findMany({
      where: {
        hiddenAt: null,
        members: { some: { userId: ctx.session.user.id } },
        OR: [{ postPermission: "ALL_MEMBERS" }, { ownerId: ctx.session.user.id }],
      },
      select: { id: true, title: true, profileUrl: true },
    }),
  ),

  byId: publicProcedure.input(idInput).query(async ({ ctx, input }) => {
    const community = await ctx.db.community.findUnique({
      where: { id: input.communityId },
      include: {
        owner: { select: userSelect },
        requirements: true,
        _count: { select: { members: true, posts: true } },
      },
    });
    const viewer = ctx.session?.user;
    if (!community || (community.hiddenAt && community.ownerId !== viewer?.id))
      throw notFound("community");
    const member = viewer ? await membership(ctx.db, community.id, viewer.id) : null;
    return { ...community, isMember: Boolean(member), isOwner: community.ownerId === viewer?.id };
  }),

  /** Whether the caller holds what the gate asks, with the numbers for the join screen. */
  gate: authedProcedure.input(idInput).query(async ({ ctx, input }) => {
    await visibleOr404(ctx.db, input.communityId, ctx.session.user.id);
    const community = await communityOr404(ctx.db, input.communityId);
    if (!community.isTokenGated || community.requirements.length === 0)
      return { gated: false, passes: true, checks: [] };
    const account = await ctx.chain.loadAccount(ctx.session.user.walletAddress);
    return {
      gated: true,
      logic: community.gateLogic,
      ...checkGate(account, community.requirements, community.gateLogic),
    };
  }),

  create: authedProcedure.input(z.object(communityFields)).mutation(async ({ ctx, input }) => {
    const { requirements, ...fields } = input;
    if (fields.isTokenGated && requirements.length === 0)
      throw refuse("Add at least one token requirement, or turn the gate off.");
    const userId = ctx.session.user.id;
    return ctx.db.community.create({
      data: {
        ...fields,
        ownerId: userId,
        requirements: { create: requirements },
        members: { create: { userId, role: "OWNER" } },
      },
      select: { id: true },
    });
  }),

  update: authedProcedure
    .input(
      idInput.extend(
        Object.fromEntries(Object.entries(communityFields).map(([k, v]) => [k, v.optional()])),
      ),
    )
    .mutation(async ({ ctx, input }) => {
      const { communityId, requirements, ...fields } = input as z.infer<typeof idInput> &
        Partial<z.infer<z.ZodObject<typeof communityFields>>>;
      const community = await communityOr404(ctx.db, communityId);
      if (community.ownerId !== ctx.session.user.id) throw forbid("Only the owner can edit this.");
      const gated = fields.isTokenGated ?? community.isTokenGated;
      if (gated && (requirements ?? community.requirements).length === 0)
        throw refuse("Add at least one token requirement, or turn the gate off.");
      return ctx.db.$transaction(async (tx) => {
        if (requirements) {
          await tx.communityTokenRequirement.deleteMany({ where: { communityId } });
          await tx.communityTokenRequirement.createMany({
            data: requirements.map((r) => ({ ...r, communityId })),
          });
        }
        return tx.community.update({
          where: { id: communityId },
          data: fields,
          select: { id: true },
        });
      });
    }),

  delete: authedProcedure.input(idInput).mutation(async ({ ctx, input }) => {
    const community = await communityOr404(ctx.db, input.communityId);
    if (community.ownerId !== ctx.session.user.id) throw forbid("Only the owner can delete this.");
    await ctx.db.community.delete({ where: { id: community.id } });
    return { ok: true };
  }),

  join: authedProcedure.input(idInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    const community = await communityOr404(ctx.db, input.communityId);
    notHidden(community);
    if (await membership(ctx.db, community.id, userId)) return { ok: true };
    if (community.isTokenGated && community.requirements.length > 0) {
      const account = await ctx.chain.loadAccount(ctx.session.user.walletAddress);
      if (!checkGate(account, community.requirements, community.gateLogic).passes)
        throw forbid(
          community.gateLogic === "AND"
            ? "You need all of the required tokens to join this community."
            : "You need at least one of the required tokens to join this community.",
        );
    }
    await ctx.db.communityMember.create({ data: { communityId: community.id, userId } });
    await logActivity(ctx.db, community.id, userId, "JOIN");
    await notifyCommunity(ctx, {
      type: "COMMUNITY_MEMBER_JOIN",
      actorId: userId,
      communityId: community.id,
      switch: "newMembers",
      only: [community.ownerId],
    });
    return { ok: true };
  }),

  leave: authedProcedure.input(idInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    const member = await requireMember(ctx.db, input.communityId, userId);
    if (member.role === "OWNER")
      throw refuse("The owner can't leave. Delete the community instead.");
    await ctx.db.communityMember.delete({ where: { id: member.id } });
    await logActivity(ctx.db, input.communityId, userId, "LEAVE");
    return { ok: true };
  }),

  removeMember: authedProcedure
    .input(idInput.extend({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const community = await communityOr404(ctx.db, input.communityId);
      if (community.ownerId !== ctx.session.user.id)
        throw forbid("Only the owner can remove members.");
      if (input.userId === community.ownerId) throw refuse("The owner can't be removed.");
      await ctx.db.communityMember.deleteMany({
        where: { communityId: community.id, userId: input.userId },
      });
      return { ok: true };
    }),

  members: publicProcedure
    .input(idInput.extend({ cursor: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const community = await communityOr404(ctx.db, input.communityId);
      const viewerId = ctx.session?.user.id;
      await visibleOr404(ctx.db, community.id, viewerId);
      if (
        community.memberListVisibility === "MEMBERS_ONLY" &&
        !(viewerId && (await membership(ctx.db, community.id, viewerId)))
      )
        throw forbid("Only members can see who is in this community.");
      const rows = await ctx.db.communityMember.findMany({
        where: { communityId: community.id },
        orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
        take: PAGE + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: { id: true, role: true, joinedAt: true, user: { select: userSelect } },
      });
      const next = rows.length > PAGE ? rows.pop() : undefined;
      return { items: rows, nextCursor: next?.id ?? null };
    }),

  notifySettings: authedProcedure.input(idInput).query(async ({ ctx, input }) => {
    const row = await ctx.db.communityNotificationPreference.findUnique({
      where: {
        communityId_userId: { communityId: input.communityId, userId: ctx.session.user.id },
      },
    });
    return row ?? { newPosts: true, newComments: true, newMembers: true, reactions: true };
  }),

  setNotifySettings: authedProcedure
    .input(
      idInput.extend({
        newPosts: z.boolean(),
        newComments: z.boolean(),
        newMembers: z.boolean(),
        reactions: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { communityId, ...settings } = input;
      const userId = ctx.session.user.id;
      await requireMember(ctx.db, communityId, userId);
      await ctx.db.communityNotificationPreference.upsert({
        where: { communityId_userId: { communityId, userId } },
        create: { communityId, userId, ...settings },
        update: settings,
      });
      return { ok: true };
    }),

  activity: publicProcedure
    .input(idInput.extend({ cursor: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      await visibleOr404(ctx.db, input.communityId, ctx.session?.user.id);
      const rows = await ctx.db.communityActivity.findMany({
        where: { communityId: input.communityId },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: PAGE + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        include: { actor: { select: userSelect } },
      });
      const next = rows.length > PAGE ? rows.pop() : undefined;
      return { items: rows, nextCursor: next?.id ?? null };
    }),
});

const postRouter = createRouter({
  list: publicProcedure
    .input(idInput.extend({ cursor: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const viewerId = ctx.session?.user.id;
      await visibleOr404(ctx.db, input.communityId, viewerId);
      const rows = await ctx.db.communityPost.findMany({
        where: { communityId: input.communityId },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: PAGE + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        include: {
          author: { select: userSelect },
          media: { orderBy: { sortOrder: "asc" } },
          _count: { select: { likes: true, comments: true } },
          likes: viewerId ? { where: { userId: viewerId }, select: { id: true } } : false,
        },
      });
      const next = rows.length > PAGE ? rows.pop() : undefined;
      return {
        items: rows.map(({ likes, ...post }) => ({ ...post, liked: (likes?.length ?? 0) > 0 })),
        nextCursor: next?.id ?? null,
      };
    }),

  create: authedProcedure
    .input(
      idInput.extend({
        content: z.string().trim().min(1).max(5000),
        commentsEnabled: z.boolean().default(true),
        media: z
          .array(z.object({ url: z.string().url(), type: MEDIA }))
          .max(10)
          .default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const community = await communityOr404(ctx.db, input.communityId);
      notHidden(community);
      await requireMember(ctx.db, community.id, userId);
      if (community.postPermission === "OWNER_ONLY" && community.ownerId !== userId)
        throw forbid("Only the owner can post in this community.");
      const post = await ctx.db.communityPost.create({
        data: {
          communityId: community.id,
          authorId: userId,
          content: input.content,
          commentsEnabled: input.commentsEnabled,
          media: { create: input.media.map((m, sortOrder) => ({ ...m, sortOrder })) },
        },
        select: { id: true },
      });
      await logActivity(ctx.db, community.id, userId, "POST_CREATED", post.id);
      await notifyCommunity(ctx, {
        type: "COMMUNITY_POST",
        actorId: userId,
        communityId: community.id,
        switch: "newPosts",
      });
      return post;
    }),

  update: authedProcedure
    .input(
      z.object({
        postId: z.string().min(1),
        content: z.string().trim().min(1).max(5000).optional(),
        commentsEnabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { postId, ...data } = input;
      const post = await ctx.db.communityPost.findUnique({ where: { id: postId } });
      if (!post) throw notFound("post");
      if (post.authorId !== ctx.session.user.id) throw forbid("You can only edit your own posts.");
      await ctx.db.communityPost.update({ where: { id: postId }, data });
      return { ok: true };
    }),

  /** The author or the community owner can delete. */
  delete: authedProcedure
    .input(z.object({ postId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const post = await ctx.db.communityPost.findUnique({
        where: { id: input.postId },
        include: { community: { select: { ownerId: true } } },
      });
      if (!post) throw notFound("post");
      const userId = ctx.session.user.id;
      if (post.authorId !== userId && post.community.ownerId !== userId)
        throw forbid("You can't delete this post.");
      await ctx.db.communityPost.delete({ where: { id: post.id } });
      return { ok: true };
    }),

  /** Likes or un-likes; returns the new state. */
  like: authedProcedure
    .input(z.object({ postId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const post = await ctx.db.communityPost.findUnique({ where: { id: input.postId } });
      if (!post) throw notFound("post");
      notHidden(await visibleOr404(ctx.db, post.communityId, userId));
      await requireMember(ctx.db, post.communityId, userId);
      const key = { postId_userId: { postId: post.id, userId } };
      const existing = await ctx.db.communityPostLike.findUnique({ where: key });
      if (existing) {
        await ctx.db.communityPostLike.delete({ where: key });
        return { liked: false };
      }
      await ctx.db.communityPostLike.create({ data: { postId: post.id, userId } });
      if (post.authorId !== userId) {
        await logActivity(ctx.db, post.communityId, userId, "POST_LIKED", post.id);
        await notifyCommunity(ctx, {
          type: "COMMUNITY_REACTION",
          actorId: userId,
          communityId: post.communityId,
          switch: "reactions",
          only: [post.authorId],
        });
      }
      return { liked: true };
    }),
});

const commentRouter = createRouter({
  list: publicProcedure
    .input(z.object({ postId: z.string().min(1), cursor: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const post = await ctx.db.communityPost.findUnique({
        where: { id: input.postId },
        select: { communityId: true },
      });
      if (!post) throw notFound("post");
      await visibleOr404(ctx.db, post.communityId, ctx.session?.user.id);
      const rows = await ctx.db.communityComment.findMany({
        where: { postId: input.postId, parentId: null },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: PAGE + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        include: {
          author: { select: userSelect },
          replies: { orderBy: { createdAt: "asc" }, include: { author: { select: userSelect } } },
        },
      });
      const next = rows.length > PAGE ? rows.pop() : undefined;
      return { items: rows, nextCursor: next?.id ?? null };
    }),

  create: authedProcedure
    .input(
      z.object({
        postId: z.string().min(1),
        body: z.string().trim().min(1).max(2000),
        parentId: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const post = await ctx.db.communityPost.findUnique({ where: { id: input.postId } });
      if (!post) throw notFound("post");
      notHidden(await visibleOr404(ctx.db, post.communityId, userId));
      await requireMember(ctx.db, post.communityId, userId);
      if (!post.commentsEnabled) throw refuse("Comments are turned off for this post.");
      let parentAuthorId: string | null = null;
      if (input.parentId) {
        const parent = await ctx.db.communityComment.findUnique({ where: { id: input.parentId } });
        if (!parent || parent.postId !== post.id) throw notFound("comment");
        parentAuthorId = parent.authorId;
      }
      const comment = await ctx.db.communityComment.create({
        data: { postId: post.id, authorId: userId, body: input.body, parentId: input.parentId },
        select: { id: true },
      });
      await logActivity(ctx.db, post.communityId, userId, "COMMENT_CREATED", comment.id);
      // A reply tells the comment's author; either way the post's author hears too (once).
      const base = {
        actorId: userId,
        communityId: post.communityId,
        switch: "newComments",
      } as const;
      if (parentAuthorId)
        await notifyCommunity(ctx, { ...base, type: "COMMUNITY_REPLY", only: [parentAuthorId] });
      await notifyCommunity(ctx, {
        ...base,
        type: "COMMUNITY_COMMENT",
        only: [post.authorId].filter((id) => id !== parentAuthorId),
      });
      return comment;
    }),

  /** The author, the post's author or the community owner can delete. */
  delete: authedProcedure
    .input(z.object({ commentId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.db.communityComment.findUnique({
        where: { id: input.commentId },
        include: { post: { select: { authorId: true, community: { select: { ownerId: true } } } } },
      });
      if (!comment) throw notFound("comment");
      const userId = ctx.session.user.id;
      if (
        ![comment.authorId, comment.post.authorId, comment.post.community.ownerId].includes(userId)
      )
        throw forbid("You can't delete this comment.");
      await ctx.db.communityComment.delete({ where: { id: comment.id } });
      return { ok: true };
    }),
});

export const communitiesRouter = createRouter({
  ...communityRouter._def.procedures,
  post: postRouter,
  comment: commentRouter,
});
