import { Address, Keypair, xdr } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import { credentialAddress } from "../server/soroban";

const pub = Keypair.random().publicKey();

const credentials = () =>
  new xdr.SorobanAddressCredentials({
    address: new Address(pub).toScAddress(),
    nonce: xdr.Int64.fromString("7"),
    signatureExpirationLedger: 0,
    signature: xdr.ScVal.scvVoid(),
  });

describe("credentialAddress", () => {
  it("reads the signer from classic address credentials", () => {
    expect(credentialAddress(xdr.SorobanCredentials.sorobanCredentialsAddress(credentials()))).toBe(
      pub,
    );
  });

  it("reads it from the newer address_v2 credentials too, which current Stellar nodes produce", () => {
    expect(
      credentialAddress(xdr.SorobanCredentials.sorobanCredentialsAddressV2(credentials())),
    ).toBe(pub);
  });

  it("is null for the transaction source's own auth, which the envelope signature covers", () => {
    expect(credentialAddress(xdr.SorobanCredentials.sorobanCredentialsSourceAccount())).toBeNull();
  });
});
