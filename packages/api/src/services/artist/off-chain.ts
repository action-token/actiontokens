import { slugFromName } from "@actiontokens/utils/slug";
import { announceItem } from "../notifications/item";

import type { Context } from "../../context";
import { type ItemAccessInput, resolveItemAccess } from "./item-access";
import {
  checkOwnUrls,
  checkPrices,
  checkSupply,
  type CollectibleType,
  freeSlug,
  invalid,
  NEEDS_FILE,
} from "./items";

/**
 * Non Stellar items, as on the old Bandcoin: no asset code and nothing on
 * Stellar. Fans buy them with a plain payment to the artist (BANDCOIN, XLM,
 * USDC or card, through the usual order flow) and ownership lives in the
 * database; the stock is the supply limit minus the copies sold. Free to
 * create, and no artist account is needed. They can't be resold.
 */
type ServiceCtx = Pick<Context, "db" | "activity">;
type ArtistRef = { id: string; slug: string; issuerAccountId: string | null };

export type CreateOffChainInput = {
  type: Exclude<CollectibleType, "ROYALTY">;
  title: string;
  description?: string;
  coverUrl: string;
  media?: { url: string; mediaType: "AUDIO" | "VIDEO" | "IMAGE" | "MODEL_3D" | "DOCUMENT" };
  /** How many can be sold, as main's supply limit */
  supply: number;
  priceBandcoin: string;
  priceUsd: string;
  visibility: "DRAFT" | "PUBLIC";
  access?: ItemAccessInput;
};

export async function createOffChainItem(
  ctx: ServiceCtx,
  artist: ArtistRef,
  user: { id: string },
  input: CreateOffChainInput,
) {
  if (input.supply === null || input.supply === undefined)
    throw invalid("Set how many can be sold.");
  checkSupply(input.supply);
  checkPrices(input);
  checkOwnUrls({ cover: input.coverUrl, file: input.media?.url });
  if (NEEDS_FILE.includes(input.type) && !input.media)
    throw invalid("Add the file people will get.");
  const access = await resolveItemAccess(ctx, artist, input.access);

  const item = await ctx.db.item.create({
    data: {
      type: input.type,
      chainType: "OFF_CHAIN",
      title: input.title.trim(),
      slug: await freeSlug(ctx.db, `${artist.slug}-${slugFromName(input.title)}`),
      description: input.description?.trim() || null,
      coverUrl: input.coverUrl,
      visibility: input.visibility,
      ...access,
      supply: input.supply,
      artistId: artist.id,
      createdById: user.id,
      ...(input.media
        ? { media: { create: { mediaType: input.media.mediaType, sourceUrl: input.media.url } } }
        : {}),
      listings: {
        create: {
          sellerId: user.id,
          kind: "PRIMARY",
          status: input.visibility === "PUBLIC" ? "ACTIVE" : "PAUSED",
          priceBandcoin: input.priceBandcoin,
          priceUsd: input.priceUsd,
        },
      },
    },
    select: { id: true, slug: true },
  });
  ctx.activity.set({ targetType: "Item", targetId: item.id });
  await announceItem(ctx, item.id);
  return { itemId: item.id, slug: item.slug };
}
