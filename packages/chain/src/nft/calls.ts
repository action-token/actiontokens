import type { Account } from "@stellar/stellar-sdk";

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
    ? buildContractCall({ ...input, method: "list", args: [seller, arg.u32(first), priceEntries(input.prices)] })
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
