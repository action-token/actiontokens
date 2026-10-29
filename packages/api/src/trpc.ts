import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { z, ZodError } from "zod";

import { AppError, ErrorCodes, isAppError } from "@bandcoin/errors";
import { appErrorMiddleware } from "@bandcoin/errors/trpc";

import { logActivity } from "./activity/middleware";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        /** The stable AppError code, so the UI can branch without parsing messages */
        appCode: isAppError(error.cause) ? error.cause.code : null,
        zodError: error.cause instanceof ZodError ? z.flattenError(error.cause) : null,
      },
    };
  },
});

export const createRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

/**
 * Every procedure starts here: AppErrors become the matching tRPC error, and
 * every mutation writes an activity log row (see activity/middleware.ts).
 */
const baseProcedure = t.procedure
  .use(t.middleware(appErrorMiddleware))
  .use(t.middleware(logActivity));

/** Anyone, signed in or not. Browsing and previews work without an account. */
export const publicProcedure = baseProcedure;

/** Signed-in users: `ctx.session.user` is guaranteed. */
export const authedProcedure = baseProcedure.use(({ ctx, next }) => {
  const user = ctx.session?.user;
  if (!user) throw new AppError(ErrorCodes.AUTH_REQUIRED);
  return next({ ctx: { session: { user } } });
});

/** Artists (and admins acting as one): `ctx.artist` is the caller's approved artist profile. */
export const artistProcedure = authedProcedure.use(async ({ ctx, next }) => {
  const artist = await ctx.db.artist.findUnique({ where: { userId: ctx.session.user.id } });
  if (!artist) throw new AppError(ErrorCodes.AUTH_NOT_A_CREATOR);
  if (artist.status !== "APPROVED") {
    throw new AppError(ErrorCodes.AUTH_FORBIDDEN, {
      message: "Your artist profile is waiting for approval.",
    });
  }
  return next({ ctx: { artist } });
});

export const adminProcedure = authedProcedure.use(({ ctx, next }) => {
  if (ctx.session.user.role !== "ADMIN") throw new AppError(ErrorCodes.AUTH_ADMIN_ONLY);
  return next();
});
