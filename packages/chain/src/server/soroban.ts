import {
  Address,
  authorizeEntry,
  Contract,
  Keypair,
  nativeToScVal,
  Operation,
  rpc,
  scValToNative,
  type Transaction,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";

import { AppError, ErrorCodes } from "@bandcoin/errors";

import { chainConfig } from "./config";

/** Server auth signatures stay valid this many ledgers (about 5 s each). */
const AUTH_VALID_LEDGERS = 60;

let server: rpc.Server | null = null;
const sorobanRpc = () => (server ??= new rpc.Server(chainConfig().rpcUrl));

/**
 * Simulates a contract call and returns it ready for the user to sign:
 * footprint and resource fee filled in, and the auth entries of any
 * platform-held party (the treasury on NFT buys) signed with `authSecrets`.
 * A contract error surfaces here, before the user is asked to sign anything.
 */
export async function prepareContractCall(
  unpreparedXdr: string,
  authSecrets: string[] = [],
): Promise<string> {
  const { passphrase } = chainConfig().network;
  const tx = TransactionBuilder.fromXDR(unpreparedXdr, passphrase) as Transaction;
  const invoke = tx.operations[0];
  if (tx.operations.length !== 1 || invoke?.type !== "invokeHostFunction") {
    throw new AppError(ErrorCodes.STELLAR_TX_BUILD_FAILED, {
      message: "Expected one contract call",
    });
  }

  const simulation = await sorobanRpc().simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(simulation)) {
    throw new AppError(ErrorCodes.STELLAR_TX_BUILD_FAILED, {
      message: "The contract rejected this. Check the price and stock and try again.",
      details: { error: "error" in simulation ? simulation.error : "restore needed" },
    });
  }

  const signers = authSecrets.map((secret) => Keypair.fromSecret(secret));
  const { sequence } = await sorobanRpc().getLatestLedger();
  const auth = await Promise.all(
    (simulation.result?.auth ?? []).map(async (entry) => {
      const signer = signers.find((keypair) => keypair.publicKey() === addressOf(entry));
      return signer
        ? authorizeEntry(entry, signer, sequence + AUTH_VALID_LEDGERS, passphrase)
        : entry;
    }),
  );

  // Replace the operation, never mutate it; build() once (it consumes a sequence number).
  return rpc
    .assembleTransaction(tx, simulation)
    .clearOperations()
    .addOperation(Operation.invokeHostFunction({ source: invoke.source, func: invoke.func, auth }))
    .build()
    .toXDR();
}

/** The account an auth entry is for; null when it is the transaction source's own auth. */
function addressOf(entry: xdr.SorobanAuthorizationEntry): string | null {
  return credentialAddress(entry.credentials);
}

/**
 * The signer named by a set of credentials. Current nodes simulate with
 * `address_v2` credentials as well as the classic `address` kind; missing one
 * leaves the entry unsigned and the contract call fails on-chain.
 */
export function credentialAddress(credentials: xdr.SorobanCredentials): string | null {
  switch (credentials.type) {
    case "sorobanCredentialsAddress":
      return Address.fromScAddress(credentials.address.address).toString();
    case "sorobanCredentialsAddressV2":
      return Address.fromScAddress(credentials.addressV2.address).toString();
    case "sorobanCredentialsAddressWithDelegates":
      return Address.fromScAddress(
        credentials.addressWithDelegates.addressCredentials.address,
      ).toString();
    default:
      return null;
  }
}
/**
 * The id of the edition registered under `editionRef` on the nft_oz contract
 * (`edition_by_ref`), or null when none exists. A read-only simulation, so it
 * costs nothing and signs nothing; `reader` only has to be an account that exists.
 */
export async function readEditionId(
  contract: string | null,
  reader: string,
  editionRef: string,
): Promise<number | null> {
  const id = await readContract<number | null | undefined>(
    contract,
    reader,
    "edition_by_ref",
    [nativeToScVal(editionRef, { type: "string" })],
    "Couldn't read the edition from the contract.",
  );
  return id ?? null;
}

/**
 * What the nft_oz contract enforces now: the platform fee (basis points), the
 * account it goes to, and the owner (the only one who may change them).
 */
export async function readNftFeeSettings(contract: string | null, reader: string) {
  const read = <T>(method: string) =>
    readContract<T>(contract, reader, method, [], "Couldn't read the fee from the contract.");
  const [feeBps, treasury, owner] = await Promise.all([
    read<number>("platform_fee_bps"),
    read<string | null | undefined>("treasury"),
    read<string | null | undefined>("get_owner"),
  ]);
  return { feeBps, treasury: treasury ?? null, owner: owner ?? null };
}

/** A read-only call: simulated, never signed or sent. `reader` only has to be an account that exists. */
async function readContract<T>(
  contract: string | null,
  reader: string,
  method: string,
  args: xdr.ScVal[],
  failure: string,
): Promise<T> {
  if (!contract)
    throw new AppError(ErrorCodes.CONFIG_MISSING, { message: "NFT_CONTRACT isn't set." });
  const { passphrase } = chainConfig().network;
  const account = await sorobanRpc().getAccount(reader);
  const tx = new TransactionBuilder(account, { fee: "100", networkPassphrase: passphrase })
    .addOperation(new Contract(contract).call(method, ...args))
    .setTimeout(30)
    .build();
  const simulation = await sorobanRpc().simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(simulation) || !simulation.result)
    throw new AppError(ErrorCodes.STELLAR_TX_BUILD_FAILED, { message: failure });
  return scValToNative(simulation.result.retval) as T;
}

/** Whether a contract exists at this address (an asset's contract is only there once set up). */
export async function contractIsLive(contract: string): Promise<boolean> {
  try {
    await sorobanRpc().getContractData(
      contract,
      xdr.ScVal.scvLedgerKeyContractInstance(),
      rpc.Durability.Persistent,
    );
    return true;
  } catch {
    return false;
  }
}
