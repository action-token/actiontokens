import { z } from "zod";

import { signCreatorUpload } from "@bandcoin/storage";

import { cancelPurchase } from "../../services/purchase";
import {
  createNftDraft,
  quoteNftRegistration,
  startNftRegistration,
  submitNftRegistration,
} from "../../services/artist/nft";
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
  upload: artistProcedure.input(declaredFile).mutation(({ input }) => signCreatorUpload(input)),

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

  /** A contract NFT, saved as a draft. Registering it on the contract is the next step (nftQuote, nftStart, nftSubmit). */
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
    .mutation(({ ctx, input }) => createNftDraft(ctx, ctx.artist, ctx.session.user, input)),

  /** What registering costs, and whether it can go through. Refreshes while the artist looks at it. */
  nftQuote: artistProcedure
    .input(z.object({ itemId: z.string().min(1) }))
    .query(({ ctx, input }) =>
      quoteNftRegistration(ctx, ctx.session.user, ctx.artist, input.itemId),
    ),

  nftStart: artistProcedure
    .input(z.object({ itemId: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      startNftRegistration(ctx, ctx.session.user, ctx.artist, input.itemId),
    ),

  nftSubmit: artistProcedure
    .input(z.object({ orderId: z.string().min(1), xdr: z.string().min(1) }))
    .mutation(({ ctx, input }) => submitNftRegistration(ctx, ctx.session.user, input)),

  nftCancel: artistProcedure
    .input(z.object({ orderId: z.string().min(1) }))
    .mutation(({ ctx, input }) => cancelPurchase(ctx, ctx.session.user, input.orderId)),
});
