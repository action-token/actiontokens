import { type Account, Address, Contract, nativeToScVal, xdr } from "@stellar/stellar-sdk";

import { finish, type NetworkParams, startTransaction } from "./transaction";

/** Argument encoders matching the Rust contract types. */
export const arg = {
  address: (value: string) => new Address(value).toScVal(),
  string: (value: string) => nativeToScVal(value, { type: "string" }),
  u32: (value: number) => nativeToScVal(value, { type: "u32" }),
  i128: (value: bigint) => nativeToScVal(value, { type: "i128" }),
  vec: (values: xdr.ScVal[]) => xdr.ScVal.scvVec(values),
  /** A #[contracttype] struct: a map with its fields sorted by name, as Soroban requires */
  struct: (fields: Record<string, xdr.ScVal>) =>
    xdr.ScVal.scvMap(
      Object.keys(fields)
        .sort()
        .map((key) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val: fields[key]! })),
    ),
};

/**
 * An unprepared contract call with `source` as the fee payer. Soroban
 * transactions can't carry a memo, so contract orders are matched by their
 * transaction hash (and NFT primary sales by `purchase_ref`). The server
 * simulates and prepares it (adds the footprint and resource fee) before it
 * is signed; see `server/soroban.ts`.
 */
export function buildContractCall(input: {
  source: Account;
  network: NetworkParams;
  contract: string;
  method: string;
  args: xdr.ScVal[];
  serverSigners?: string[];
}) {
  const builder = startTransaction(input.source, input.network).addOperation(
    new Contract(input.contract).call(input.method, ...input.args),
  );
  return finish(builder, input.serverSigners);
}
