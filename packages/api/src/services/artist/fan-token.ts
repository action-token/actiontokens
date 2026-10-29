import { StrKey } from "@stellar/stellar-sdk";

import { AppError, ErrorCodes } from "@bandcoin/errors";
import { assetCodeFrom, normalizeAssetCode, validateAssetCode } from "@bandcoin/utils/asset-code";

import type { Context } from "../../context";
import { checkOwnUrls, freeSlug, invalid } from "./items";

/**
 * An artist's fan token: the classic token their membership tiers count
 * ("hold N of it"). There is one per artist, and it can come three ways:
 *
 *   GENERATE  a code made from the artist's name, issued under their own account
 *   CUSTOM    a code the artist chooses, issued under their own account
 *   EXISTING  an asset they already issued on Stellar, which we only read
 *
 * The code is its name on Stellar and can't change, so the artist sees it before it's made.
 */
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;
type ArtistRef = {
  id: string;
  slug: string;
  name: string;
  issuerAccountId: string | null;
  fanTokenItemId: string | null;
};

export type CreateFanTokenInput =
  | { mode: "GENERATE"; coverUrl: string; description?: string }
  | { mode: "CUSTOM"; code: string; coverUrl: string; description?: string }
  | { mode: "EXISTING"; code: string; issuer: string; coverUrl: string; description?: string };

/** What we found out about a token the artist already issued on Stellar. */
export type TokenCheck =
  | { status: "OK"; code: string }
  | { status: "INVALID" | "NOT_FOUND"; message: string }
  | { status: "USED"; message: string; byYou: boolean };

/**
 * Is this existing Stellar asset usable as the fan token? It has to be a valid
 * code and issuer, exist on Stellar, and not already be an item here (yours or
 * another artist's). Used live while the artist types and again when they save.
 */
export async function checkExistingToken(
  ctx: Pick<ServiceCtx, "db" | "chain">,
  artist: Pick<ArtistRef, "id">,
  input: { code: string; issuer: string },
): Promise<TokenCheck> {
  const code = normalizeAssetCode(input.code);
  const problem = validateAssetCode(code);
  if (problem) return { status: "INVALID", message: problem };
  if (!StrKey.isValidEd25519PublicKey(input.issuer))
    return { status: "INVALID", message: "Enter the issuer's public key (it starts with G)." };
  if (!(await ctx.chain.assetExists(code, input.issuer)))
    return {
      status: "NOT_FOUND",
      message: "We couldn't find that asset on Stellar. Check the code and the issuer.",
    };
  const used = await ctx.db.classicToken.findUnique({
    where: { code_issuer: { code, issuer: input.issuer } },
    select: { item: { select: { title: true, artistId: true } } },
  });
  if (used) {
    const byYou = used.item?.artistId === artist.id;
    return {
      status: "USED",
      byYou,
      message: byYou
        ? `You already use this token for "${used.item?.title}".`
        : "That asset is already used for another item.",
    };
  }
  return { status: "OK", code };
}

export async function createFanToken(
  ctx: ServiceCtx,
  artist: ArtistRef,
  user: { id: string },
  input: CreateFanTokenInput,
) {
  const { db, chain } = ctx;
  if (artist.fanTokenItemId)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: "You already have a fan token." });
  checkOwnUrls({ cover: input.coverUrl });

  let token: { code: string; issuer: string; issuerAccountId?: string; isExternal: boolean };
  if (input.mode === "EXISTING") {
    const check = await checkExistingToken(ctx, artist, input);
    if (check.status !== "OK")
      throw check.status === "USED"
        ? new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: check.message })
        : invalid(check.message);
    token = { code: check.code, issuer: input.issuer, isExternal: true };
  } else {
    const issuer = artist.issuerAccountId
      ? await db.chainAccount.findUnique({
          where: { id: artist.issuerAccountId },
          select: { id: true, publicKey: true, activatedAt: true },
        })
      : null;
    if (!issuer?.activatedAt)
      throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
        message: "Open your artist account first.",
      });

    const taken = async (code: string) =>
      Boolean(
        await db.classicToken.findUnique({
          where: { code_issuer: { code, issuer: issuer.publicKey } },
          select: { itemId: true },
        }),
      );
    let code: string;
    if (input.mode === "CUSTOM") {
      code = normalizeAssetCode(input.code);
      const problem = validateAssetCode(code);
      if (problem) throw invalid(problem);
      if (await taken(code))
        throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
          message: "You already use that code for another item.",
        });
    } else {
      const base = assetCodeFrom(artist.name) || "FANS";
      code = base;
      for (let n = 2; await taken(code); n += 1)
        code = `${base.slice(0, 12 - String(n).length)}${n}`;
      const problem = validateAssetCode(code);
      if (problem) throw invalid(problem);
    }
    token = { code, issuer: issuer.publicKey, issuerAccountId: issuer.id, isExternal: false };
  }

  const itemId = await db.$transaction(async (tx) => {
    const item = await tx.item.create({
      data: {
        type: "FAN_TOKEN",
        chainType: "CLASSIC_TOKEN",
        title: `${artist.name} fan token`,
        slug: await freeSlug(db, `${artist.slug}-fan-token`),
        description: input.description?.trim() || null,
        coverUrl: input.coverUrl,
        visibility: "PUBLIC",
        supply: null,
        artistId: artist.id,
        createdById: user.id,
        classicToken: { create: token },
      },
      select: { id: true },
    });
    await tx.artist.update({ where: { id: artist.id }, data: { fanTokenItemId: item.id } });
    return item.id;
  });
  ctx.activity.set({ targetType: "Item", targetId: itemId });
  return { itemId, code: token.code };
}

/** The artist's fan token, or null before they have made one. */
export async function getFanToken(
  ctx: Pick<ServiceCtx, "db">,
  artist: Pick<ArtistRef, "fanTokenItemId">,
) {
  if (!artist.fanTokenItemId) return null;
  const item = await ctx.db.item.findFirst({
    where: { id: artist.fanTokenItemId, deletedAt: null },
    select: {
      id: true,
      coverUrl: true,
      classicToken: { select: { code: true, issuer: true, isExternal: true } },
    },
  });
  if (!item?.classicToken) return null;
  return {
    itemId: item.id,
    code: item.classicToken.code,
    issuer: item.classicToken.issuer,
    external: item.classicToken.isExternal,
    coverUrl: item.coverUrl,
  };
}
