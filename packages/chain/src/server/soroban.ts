import { Address, authorizeEntry, Keypair, Operation, rpc, type Transaction, TransactionBuilder, type xdr } from "@stellar/stellar-sdk";

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
export async function prepareContractCall(unpreparedXdr: string, authSecrets: string[] = []): Promise<string> {
  const { passphrase } = chainConfig().network;
  const tx = TransactionBuilder.fromXDR(unpreparedXdr, passphrase) as Transaction;
  const invoke = tx.operations[0];
  if (tx.operations.length !== 1 || invoke?.type !== "invokeHostFunction") {
    throw new AppError(ErrorCodes.STELLAR_TX_BUILD_FAILED, { message: "Expected one contract call" });
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
      return signer ? authorizeEntry(entry, signer, sequence + AUTH_VALID_LEDGERS, passphrase) : entry;
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
  const { credentials } = entry;
  if (credentials.type !== "sorobanCredentialsAddress") return null;
  return Address.fromScAddress(credentials.address.address).toString();
}
