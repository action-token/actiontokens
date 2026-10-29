import type { Account, Asset } from "@stellar/stellar-sdk";

import { arg, buildContractCall } from "../soroban";
import type { NetworkParams } from "../transaction";

/**
 * Calls on the `nft_oz` contract (contracts/nft_oz in bandfan). The buyer is
 * the source of every buy, so they pay the network fee; `inclusion_fee` and
 * `network_fee` are charged to the buyer by the contract, in the payment
 * token. The treasury co-signs buys (`require_treasury_auth`).
 */

/** Most copies one `buy_edition` or `buy_batch` call can take (MAX_QUANTITY_PER_BUY). */
export const NFT_MAX_PER_BUY = 20;

type Common = { source: Account; network: NetworkParams; contract: string };
type Fees = { inclusionFee: bigint; networkFee: bigint };

export type PriceEntry = { paymentToken: string; price: bigint };

const priceEntries = (prices: PriceEntry[]) =>
  arg.vec(
    prices.map((entry) =>
      arg.struct({ payment_token: arg.address(entry.paymentToken), price: arg.i128(entry.price) }),
    ),
  );

/** Primary sale: mints `quantity` copies of an edition straight to the buyer. */
export function buildNftBuyEdition(
  input: Common &
    Fees & {
      editionRef: string;
      /** A fresh id per attempt (the order id); the contract rejects reuse */
      purchaseRef: string;
      paymentToken: string;
      quantity: number;
      treasury: string;
    },
) {
  if (input.quantity < 1 || input.quantity > NFT_MAX_PER_BUY) {
    throw new RangeError(`An NFT purchase takes 1 to ${NFT_MAX_PER_BUY} copies`);
  }
  const buyer = input.source.accountId();
  return buildContractCall({
    ...input,
    method: "buy_edition",
    serverSigners: [input.treasury],
    args: [
      arg.address(buyer),
      arg.string(input.editionRef),
      arg.string(input.purchaseRef),
      arg.address(input.paymentToken),
      arg.u32(input.quantity),
      arg.i128(input.inclusionFee),
      arg.i128(input.networkFee),
    ],
  });
}

/** Resale: buys one or more listed tokens, all paid in the same token. */
export function buildNftBuyListed(
  input: Common & Fees & { tokenIds: number[]; paymentToken: string; treasury: string },
) {
  const buyer = input.source.accountId();
  const [first, ...rest] = input.tokenIds;
  if (first === undefined) throw new RangeError("Pick at least one token");
  if (input.tokenIds.length > NFT_MAX_PER_BUY) {
    throw new RangeError(`An NFT purchase takes 1 to ${NFT_MAX_PER_BUY} copies`);
  }
  const fees = [arg.i128(input.inclusionFee), arg.i128(input.networkFee)];
  const common = { ...input, serverSigners: [input.treasury] };

  return rest.length === 0
    ? buildContractCall({
        ...common,
        method: "buy",
        args: [arg.address(buyer), arg.u32(first), arg.address(input.paymentToken), ...fees],
      })
    : buildContractCall({
        ...common,
        method: "buy_batch",
        args: [
          arg.address(buyer),
          arg.vec(input.tokenIds.map(arg.u32)),
          arg.address(input.paymentToken),
          ...fees,
        ],
      });
}

/** The owner lists tokens for resale at a price per payment token. */
export function buildNftList(input: Common & { tokenIds: number[]; prices: PriceEntry[] }) {
  const seller = arg.address(input.source.accountId());
  const [first, ...rest] = input.tokenIds;
  if (first === undefined) throw new RangeError("Pick at least one token");
  return rest.length === 0
    ? buildContractCall({
        ...input,
        method: "list",
        args: [seller, arg.u32(first), priceEntries(input.prices)],
      })
    : buildContractCall({
        ...input,
        method: "list_batch",
        args: [seller, arg.vec(input.tokenIds.map(arg.u32)), priceEntries(input.prices)],
      });
}

export function buildNftCancelListing(input: Common & { tokenId: number }) {
  return buildContractCall({
    ...input,
    method: "cancel_listing",
    args: [arg.address(input.source.accountId()), arg.u32(input.tokenId)],
  });
}

/**
 * The price authority (server) sets an edition's prices per payment token.
 * The artist sets BANDCOIN and USD; the server refreshes the XLM and USDC
 * entries from the live rate before a buy.
 */
export function buildNftUpdateEdition(
  input: Common & {
    editionId: number;
    title: string;
    description: string;
    thumbnailUrl: string;
    supply: number;
    prices: PriceEntry[];
  },
) {
  return buildContractCall({
    ...input,
    method: "update_edition",
    args: [
      arg.address(input.source.accountId()),
      arg.u32(input.editionId),
      arg.string(input.title),
      arg.string(input.description),
      arg.string(input.thumbnailUrl),
      arg.u32(input.supply),
      priceEntries(input.prices),
    ],
  });
}

/** Most copies an edition can ever have (MAX_SUPPLY in the contract). */
export const NFT_MAX_SUPPLY = 100_000;
const NFT_MAX_TITLE = 128;
const NFT_MAX_DESCRIPTION = 2_000;
const NFT_MAX_URI = 2_048;
const NFT_MAX_PRICE_ENTRIES = 5;
/** The most royalty an edition can pay its creator on resales: 90% (MAX_ROYALTY_BPS). */
const NFT_MAX_ROYALTY_BPS = 9_000;

/** The contract address of an asset (its Stellar Asset Contract): what `nft_oz` takes as a payment token. */
export function tokenAddressOf(asset: Asset, passphrase: string) {
  return asset.contractId(passphrase);
}

/**
 * Registers an edition on the contract before its first sale. The price
 * authority (`caller`) must authorise it; the artist is the transaction's
 * source, so the artist pays the network fee and the platform pays nothing.
 * Checks what the contract checks, so a bad edition fails here with a plain
 * message instead of after the artist has signed.
 */
export function buildNftRegisterEdition(
  input: Common & {
    /** The price authority, which signs the authorisation (the platform's treasury) */
    caller: string;
    /** The app's own id for the item; resolves the edition later (`edition_by_ref`) */
    editionRef: string;
    title: string;
    description: string;
    thumbnailUrl: string;
    mediaUrl: string;
    mediaType: string;
    creator: string;
    royaltyBps: number;
    supply: number;
    prices: PriceEntry[];
  },
) {
  const fail = (message: string): never => {
    throw new RangeError(message);
  };
  if (input.title.length === 0) fail("Give it a title");
  if (input.title.length > NFT_MAX_TITLE) fail(`Title can be at most ${NFT_MAX_TITLE} characters`);
  if (input.description.length > NFT_MAX_DESCRIPTION)
    fail(`Description can be at most ${NFT_MAX_DESCRIPTION} characters`);
  if (input.thumbnailUrl.length === 0 || input.thumbnailUrl.length > NFT_MAX_URI)
    fail("The cover address is missing or too long");
  if (input.mediaUrl.length === 0 || input.mediaUrl.length > NFT_MAX_URI)
    fail("The file address is missing or too long");
  if (!Number.isInteger(input.supply) || input.supply < 1 || input.supply > NFT_MAX_SUPPLY)
    fail(`Supply must be from 1 to ${NFT_MAX_SUPPLY}`);
  if (input.royaltyBps < 0 || input.royaltyBps > NFT_MAX_ROYALTY_BPS)
    fail("Royalty can be at most 90%");
  if (input.prices.length === 0) fail("Add at least one price");
  if (input.prices.length > NFT_MAX_PRICE_ENTRIES)
    fail(`Use at most ${NFT_MAX_PRICE_ENTRIES} prices`);
  if (input.prices.some((entry) => entry.price <= 0n)) fail("Prices must be above zero");

  return buildContractCall({
    ...input,
    method: "register_edition",
    serverSigners: [input.caller],
    args: [
      arg.address(input.caller),
      arg.string(input.editionRef),
      arg.struct({
        title: arg.string(input.title),
        description: arg.string(input.description),
        thumbnail_url: arg.string(input.thumbnailUrl),
        media_url: arg.string(input.mediaUrl),
        media_type: arg.string(input.mediaType),
        creator: arg.address(input.creator),
        royalty_bps: arg.u32(input.royaltyBps),
        supply: arg.u32(input.supply),
        prices: priceEntries(input.prices),
      }),
    ],
  });
}
