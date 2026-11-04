import { z } from "zod";

import { fundsOf } from "@bandcoin/chain/server";
import { Prisma } from "@bandcoin/db";
import { AppError, ErrorCodes } from "@bandcoin/errors";
import { isOwnS3Url, signImageUpload } from "@bandcoin/storage";

import { isCustodial } from "../../context";
import { deleteAccount } from "../../services/account/delete";
import {
  normalizeUsername,
  usernameChangeOpensAt,
  validateUsername,
} from "../../services/account/username";
import { authedProcedure, createRouter, publicProcedure } from "../../trpc";

const declaredImage = z.object({
  fileName: z.string().min(1).max(200),
  fileType: z.string().min(1).max(100),
  fileSize: z.number().int().positive(),
  checksum: z.string().min(1).max(100),
});

export const accountRouter = createRouter({
  /** Deletes your own account (typed confirmation; refuses when it would lose money). */
  delete: authedProcedure
    .input(z.object({ confirm: z.string().max(20) }))
    .mutation(({ ctx, input }) => deleteAccount(ctx, ctx.session.user, input)),

  /**
   * Who is signed in, for the header and account menu: profile, artist page
   * and spendable balances. Null when signed out, so pages can call it freely.
   */
  me: publicProcedure.query(async ({ ctx }) => {
    const sessionUser = ctx.session?.user;
    if (!sessionUser) return null;
    const [user, account] = await Promise.all([
      ctx.db.user.findUnique({
        where: { id: sessionUser.id },
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          email: true,
          role: true,
          walletAddress: true,
          artist: { select: { slug: true, name: true, status: true } },
        },
      }),
      ctx.chain.loadAccount(sessionUser.walletAddress).catch(() => null),
    ]);
    if (!user) return null;
    return {
      ...user,
      walletType: sessionUser.walletType,
      custodial: isCustodial(sessionUser),
      /** False until the Stellar account exists (it needs its first XLM) */
      activated: account !== null,
      balances: fundsOf(account, ctx.chain.config.assets),
    };
  }),

  /** Everything the Settings page edits or shows. */
  settings: authedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
      select: {
        username: true,
        usernameChangedAt: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
        coverUrl: true,
        showCollection: true,
        email: true,
        signUpMethod: true,
        lastFmAccount: { select: { username: true, profileUrl: true, isConnected: true } },
      },
    });
    if (!user) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Account not found." });
    const { usernameChangedAt, lastFmAccount, ...rest } = user;
    return {
      ...rest,
      walletAddress: ctx.session.user.walletAddress,
      walletType: ctx.session.user.walletType,
      custodial: isCustodial(ctx.session.user),
      usernameChangeOpensAt: usernameChangeOpensAt(usernameChangedAt),
      lastFm: lastFmAccount?.isConnected
        ? { username: lastFmAccount.username, profileUrl: lastFmAccount.profileUrl }
        : null,
    };
  }),

  updateProfile: authedProcedure
    .input(
      z.object({
        displayName: z.string().trim().min(1).max(40).optional(),
        bio: z.string().trim().max(280).optional(),
        showCollection: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { bio, ...rest } = input;
      await ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: { ...rest, ...(bio === undefined ? {} : { bio: bio === "" ? null : bio }) },
      });
      ctx.activity.set({ targetType: "User", targetId: ctx.session.user.id });
      return { saved: true };
    }),

  /** The username is the public profile address, so it changes at most once every 30 days. */
  setUsername: authedProcedure
    .input(z.object({ username: z.string().max(60) }))
    .mutation(async ({ ctx, input }) => {
      const username = normalizeUsername(input.username);
      const problem = validateUsername(username);
      if (problem) throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: problem });

      const current = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { username: true, usernameChangedAt: true },
      });
      if (current?.username === username) return { username };
      const opensAt = current?.username ? usernameChangeOpensAt(current.usernameChangedAt) : null;
      if (opensAt && opensAt > new Date()) {
        throw new AppError(ErrorCodes.RATE_LIMITED, {
          message: "You can change your username once every 30 days.",
        });
      }
      try {
        await ctx.db.user.update({
          where: { id: ctx.session.user.id },
          data: { username, usernameChangedAt: new Date() },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: "That name is taken." });
        }
        throw error;
      }
      ctx.activity.set({ targetType: "User", targetId: ctx.session.user.id });
      return { username };
    }),

  /** A signed upload for a profile picture or cover image. */
  imageUpload: authedProcedure.input(declaredImage).mutation(({ input }) => signImageUpload(input)),

  /** The banner behind the profile; null removes it. Only a picture this app stored. */
  setCover: authedProcedure
    .input(z.object({ url: z.string().url().nullable() }))
    .mutation(async ({ ctx, input }) => {
      if (input.url !== null && !isOwnS3Url(input.url)) {
        throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: "Upload the picture again." });
      }
      await ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: { coverUrl: input.url },
      });
      ctx.activity.set({ targetType: "User", targetId: ctx.session.user.id });
      return { coverUrl: input.url };
    }),

  /** Only a picture this app stored: never a link to somewhere else. */
  setAvatar: authedProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      if (!isOwnS3Url(input.url))
        throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: "Upload the picture again." });
      await ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: { avatarUrl: input.url },
      });
      ctx.activity.set({ targetType: "User", targetId: ctx.session.user.id });
      return { avatarUrl: input.url };
    }),
});
