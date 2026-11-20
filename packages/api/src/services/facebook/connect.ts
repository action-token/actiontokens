import { AppError, ErrorCodes } from "@actiontokens/errors";

import type { Context } from "../../context";
import {
  listPages,
  openToken,
  sealToken,
  subscribePage,
  unsubscribePage,
  type FbPage,
} from "./graph";

/**
 * Connecting an artist's Facebook page. The person signs in with Facebook (the
 * app's routes do that and keep the user token in a short-lived sealed cookie),
 * picks a page, and the page's token is stored sealed. New posts on the page
 * then reach us by webhook and are copied in (see import.ts).
 */
type ServiceCtx = Pick<Context, "db" | "activity">;
type ArtistRef = { id: string };

export async function facebookStatus(ctx: Pick<ServiceCtx, "db">, artist: ArtistRef) {
  const connection = await ctx.db.facebookConnection.findUnique({
    where: { organizationId: artist.id },
    select: { pageId: true, pageName: true, autoPublish: true, connectedAt: true },
  });
  return {
    configured: Boolean(
      process.env.FACEBOOK_APP_ID &&
      process.env.FACEBOOK_APP_SECRET &&
      process.env.SOCIAL_TOKEN_ENC_KEY,
    ),
    connected: Boolean(connection),
    pageId: connection?.pageId ?? null,
    pageName: connection?.pageName ?? null,
    autoPublish: connection?.autoPublish ?? false,
    connectedAt: connection?.connectedAt ?? null,
  };
}

/** The pages a sealed user token can manage (names only; their tokens stay here). */
export async function pendingPages(sealedUserToken: string) {
  let userToken: string;
  try {
    userToken = openToken(sealedUserToken);
  } catch {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: "Your Facebook sign-in expired. Connect again.",
    });
  }
  return (await listPages(userToken)).map((page) => ({ id: page.id, name: page.name }));
}

export async function connectPage(
  ctx: ServiceCtx,
  artist: ArtistRef,
  input: { sealedUserToken: string; pageId: string },
  deps: { pages?: (userToken: string) => Promise<FbPage[]>; subscribe?: typeof subscribePage } = {},
) {
  let userToken: string;
  try {
    userToken = openToken(input.sealedUserToken);
  } catch {
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: "Your Facebook sign-in expired. Connect again.",
    });
  }
  const page = (await (deps.pages ?? listPages)(userToken)).find((p) => p.id === input.pageId);
  if (!page)
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, {
      message: "That page isn't one you manage on Facebook.",
    });
  // One page feeds one artist: otherwise a post would belong to whoever was first.
  const taken = await ctx.db.facebookConnection.findFirst({
    where: { pageId: page.id, NOT: { organizationId: artist.id } },
    select: { organizationId: true },
  });
  if (taken)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: "That page is already connected to another artist.",
    });
  try {
    await (deps.subscribe ?? subscribePage)(page.id, page.access_token);
  } catch {
    throw new AppError(ErrorCodes.EXTERNAL_SERVICE_FAILED, {
      message:
        "Facebook wouldn't let us listen to that page. Check the permissions you granted and try again.",
    });
  }
  const pageTokenEncrypted = sealToken(page.access_token);
  await ctx.db.facebookConnection.upsert({
    where: { organizationId: artist.id },
    create: { organizationId: artist.id, pageId: page.id, pageName: page.name, pageTokenEncrypted },
    update: { pageId: page.id, pageName: page.name, pageTokenEncrypted, connectedAt: new Date() },
  });
  ctx.activity.set({ targetType: "FacebookConnection", targetId: artist.id });
  return { pageId: page.id, pageName: page.name };
}

/** Kept like the old app kept it: a setting only, since publishing to the page isn't built. */
export async function setAutoPublish(ctx: ServiceCtx, artist: ArtistRef, value: boolean) {
  const { count } = await ctx.db.facebookConnection.updateMany({
    where: { organizationId: artist.id },
    data: { autoPublish: value },
  });
  if (count === 0)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: "Connect a Facebook page first.",
    });
  ctx.activity.set({ targetType: "FacebookConnection", targetId: artist.id });
  return { autoPublish: value };
}

export async function disconnectFacebook(ctx: ServiceCtx, artist: ArtistRef) {
  const connection = await ctx.db.facebookConnection.findUnique({
    where: { organizationId: artist.id },
    select: { pageId: true, pageTokenEncrypted: true },
  });
  if (connection) {
    // Stop listening first, best effort: the connection is removed either way.
    try {
      await unsubscribePage(connection.pageId, openToken(connection.pageTokenEncrypted));
    } catch {
      // The page may already be gone, or the token revoked.
    }
    await ctx.db.facebookConnection.delete({ where: { organizationId: artist.id } });
  }
  ctx.activity.set({ targetType: "FacebookConnection", targetId: artist.id });
  return { connected: false };
}
