import { z } from "zod";

import { signCreatorUpload } from "@bandcoin/storage";

import { createNft } from "../../services/artist/nft";
import { createOffChainItem } from "../../services/artist/off-chain";
import {
  closePageAssetOffer,
  createPageAssetOffer,
  pageAssetOverview,
} from "../../services/artist/page-assets";
import {
  createItem,
  getItem,
  listMyItems,
  removeItem,
  updateItem,
} from "../../services/artist/items";
import { artistProcedure, createRouter } from "../../trpc";

const price = z.string().trim().max(20);
const visibility = z.enum(["DRAFT", "PUBLIC"]);

const declaredFile = z.object({
  fileName: z.string().min(1).max(200),
  fileType: z.string().min(1).max(100),
  fileSize: z.number().int().positive(),
  checksum: z.string().min(1).max(100),
});

/** Who can buy an item: everyone, members, or one tier (main's item forms). */
export const itemAccess = z.object({
  kind: z.enum(["PUBLIC", "MEMBERS", "TIER"]),
  tierId: z.string().min(1).nullish(),
});

/** The artist's collectibles (see services/artist/items). Approved artists only. */
export const catalogRouter = createRouter({
  /** A signed upload for a cover or the item's file. */
  upload: artistProcedure
    .input(declaredFile)
    .mutation(({ input, ctx }) =>
      signCreatorUpload(input, { owner: "artists", ownerId: ctx.artist.id, kind: "uploads" }),
    ),

  get: artistProcedure
    .input(z.object({ itemId: z.string().min(1) }))
    .query(({ ctx, input }) => getItem(ctx, ctx.artist, input.itemId)),

  list: artistProcedure.query(({ ctx }) => listMyItems(ctx, ctx.artist)),

  create: artistProcedure
    .input(
      z.object({
        type: z.enum(["IMAGE", "VIDEO", "MODEL_3D", "DOCUMENT", "ROYALTY", "TICKET", "MERCH"]),
        title: z.string().trim().min(1, "Give it a title").max(120),
        description: z.string().trim().max(2000).optional(),
        coverUrl: z.string().url(),
        media: z
          .object({
            url: z.string().url(),
            mediaType: z.enum(["AUDIO", "VIDEO", "IMAGE", "MODEL_3D", "DOCUMENT"]),
          })
          .optional(),
        code: z.string().trim().max(12),
        supply: z.number().int().nullable(),
        priceBandcoin: price,
        priceUsd: price,
        visibility,
        royaltyPercent: z.string().trim().max(10).optional(),
        access: itemAccess.optional(),
      }),
    )
    .mutation(({ ctx, input }) => createItem(ctx, ctx.artist, ctx.session.user, input)),

  /** A Non Stellar item: nothing on Stellar, bought with a plain payment (services/artist/off-chain). */
  createOffChain: artistProcedure
    .input(
      z.object({
        type: z.enum(["IMAGE", "VIDEO", "MODEL_3D", "DOCUMENT", "TICKET", "MERCH"]),
        title: z.string().trim().min(1, "Give it a title").max(120),
        description: z.string().trim().max(2000).optional(),
        coverUrl: z.string().url(),
        media: z
          .object({
            url: z.string().url(),
            mediaType: z.enum(["AUDIO", "VIDEO", "IMAGE", "MODEL_3D", "DOCUMENT"]),
          })
          .optional(),
        supply: z.number().int(),
        priceBandcoin: price,
        priceUsd: price,
        visibility,
        access: itemAccess.optional(),
      }),
    )
    .mutation(({ ctx, input }) => createOffChainItem(ctx, ctx.artist, ctx.session.user, input)),

  /** Sell Page Assets: the artist's fan-token bundles from storage (services/artist/page-assets). */
  pageAssets: artistProcedure.query(({ ctx }) => pageAssetOverview(ctx, ctx.artist)),

  createPageAsset: artistProcedure
    .input(
      z.object({
        amount: z.string().trim().max(24),
        priceBandcoin: price,
        priceUsd: price,
        priceXlm: price,
        note: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(({ ctx, input }) => createPageAssetOffer(ctx, ctx.artist, ctx.session.user, input)),

  closePageAsset: artistProcedure
    .input(z.object({ offerId: z.string().min(1) }))
    .mutation(({ ctx, input }) => closePageAssetOffer(ctx, ctx.artist, input.offerId)),

  update: artistProcedure
    .input(
      z.object({
        itemId: z.string().min(1),
        title: z.string().trim().min(1).max(120).optional(),
        description: z.string().trim().max(2000).optional(),
        coverUrl: z.string().url().optional(),
        priceBandcoin: price.optional(),
        priceUsd: price.optional(),
        supply: z.number().int().nullable().optional(),
        code: z.string().trim().max(12).optional(),
        visibility: visibility.optional(),
        access: itemAccess.optional(),
      }),
    )
    .mutation(({ ctx, input }) => updateItem(ctx, ctx.artist, input)),

  remove: artistProcedure
    .input(z.object({ itemId: z.string().min(1) }))
    .mutation(({ ctx, input }) => removeItem(ctx, ctx.artist, input.itemId)),

  /** A contract NFT: a database save, on sale at once when published. The first sale registers it on the contract. */
  createNft: artistProcedure
    .input(
      z.object({
        type: z.enum(["IMAGE", "VIDEO", "MODEL_3D", "DOCUMENT", "TICKET", "MERCH"]),
        title: z.string().trim().min(1, "Give it a title").max(120),
        description: z.string().trim().max(2000).optional(),
        coverUrl: z.string().url(),
        media: z
          .object({
            url: z.string().url(),
            mediaType: z.enum(["AUDIO", "VIDEO", "IMAGE", "MODEL_3D", "DOCUMENT"]),
          })
          .optional(),
        supply: z.number().int(),
        priceBandcoin: price,
        priceUsd: price,
        resaleRoyaltyPercent: z.string().trim().max(6),
        visibility: z.enum(["DRAFT", "PUBLIC"]),
        lockedContents: z
          .array(
            z.object({
              type: z.enum(["SONG", "IMAGE", "VIDEO", "OTHER"]),
              url: z.string().trim().max(2048),
              label: z.string().trim().max(80).optional(),
              unlock: z
                .object({
                  radiusMeters: z.number(),
                  places: z
                    .array(
                      z.object({
                        lat: z.number(),
                        lng: z.number(),
                        label: z.string().trim().max(80).optional(),
                      }),
                    )
                    .max(20),
                })
                .optional(),
            }),
          )
          .max(20),
      }),
    )
    .mutation(({ ctx, input }) => createNft(ctx, ctx.artist, ctx.session.user, input)),
});
