import { NFT_MAX_SUPPLY } from "@actiontokens/chain";
import { AppError, ErrorCodes } from "@actiontokens/errors";
import { slugFromName } from "@actiontokens/utils/slug";
import { announceItem } from "../notifications/item";

import type { Context } from "../../context";
import {
  checkOwnUrls,
  checkPrices,
  type CreateItemInput,
  freeSlug,
  invalid,
  NEEDS_FILE,
} from "./items";
import {
  checkLockedContents,
  type LockedContentInput,
  lockedContentsCreate,
} from "./locked-content";

/**
 * Contract NFTs, as on the old Bandcoin: creating one is a database save,
 * nothing to sign or pay, and it can go on sale at once. The platform
 * registers the edition on the nft_oz contract at its first sale and the
 * contract mints copies as fans buy (services/purchase/nft).
 */
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;
type ArtistRef = { id: string; slug: string };

const NOT_SET_UP = "Contract NFTs aren't set up on this server yet.";

export type CreateNftInput = Omit<
  CreateItemInput,
  "code" | "supply" | "visibility" | "royaltyPercent" | "type"
> & {
  type: Exclude<CreateItemInput["type"], "ROYALTY">;
  supply: number;
  /** What the artist earns each time a copy is resold, 0 to 90 */
  resaleRoyaltyPercent: string;
  /** Hidden until a copy is bought (and its places visited); at least one, fixed once created */
  lockedContents: LockedContentInput[];
  /** PUBLIC = on sale now */
  visibility: "DRAFT" | "PUBLIC";
};

export async function createNft(
  ctx: Pick<ServiceCtx, "db" | "chain" | "activity">,
  artist: ArtistRef,
  user: { id: string },
  input: CreateNftInput,
) {
  const contract = ctx.chain.config.nftContract;
  if (!contract) throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, { message: NOT_SET_UP });
  if (!Number.isInteger(input.supply) || input.supply < 1 || input.supply > NFT_MAX_SUPPLY)
    throw invalid("Use a whole number from 1 to 100,000.");
  const royalty = Number(input.resaleRoyaltyPercent);
  if (!(royalty >= 0 && royalty <= 90)) throw invalid("Resale royalty can be from 0 to 90%.");
  checkPrices(input);
  checkOwnUrls({ cover: input.coverUrl, file: input.media?.url });
  if (NEEDS_FILE.includes(input.type) && !input.media)
    throw invalid("Add the file people will get.");
  checkLockedContents(input.lockedContents);

  const item = await ctx.db.item.create({
    data: {
      type: input.type,
      chainType: "CONTRACT_NFT",
      title: input.title.trim(),
      slug: await freeSlug(ctx.db, `${artist.slug}-${slugFromName(input.title)}`),
      description: input.description?.trim() || null,
      coverUrl: input.coverUrl,
      visibility: input.visibility,
      supply: input.supply,
      artistId: artist.id,
      createdById: user.id,
      contractNft: {
        create: {
          contractAddress: contract,
          royaltyBps: Math.round(royalty * 100),
          status: "PENDING",
        },
      },
      ...(input.media
        ? { media: { create: { mediaType: input.media.mediaType, sourceUrl: input.media.url } } }
        : {}),
      lockedContents: { create: lockedContentsCreate(input.lockedContents) },
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
