import { Account, Asset, Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import {
  assetFor,
  buildAssetContractSetup,
  buildBountyFund,
  buildBountySelectWinner,
  tokenAddressOf,
} from "@actiontokens/chain";
import type { Db } from "@actiontokens/db";

import type { SessionUser } from "../context";
import {
  createBounty,
  discardUnfunded,
  listBounties,
  setBountyStatus,
  updateBounty,
} from "../services/artist/bounties";
import {
  fundingSources,
  prepareFunding,
  prepareTokenSetup,
  prepareWinner,
  submitFunding,
  submitTokenSetup,
  submitWinner,
} from "../services/artist/bounty-escrow";
import type { ChainGateway } from "../services/chain-gateway";
import { artworkOf, searchTracks } from "../services/lastfm-search";

vi.mock("@actiontokens/storage", () => ({ isOwnS3Url: () => true }));

type Row = Record<string, unknown>;

const escrow = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const network = { passphrase: Networks.TESTNET, baseFee: "100" };
const assets = {
  bandcoin: { code: "BANDCOIN", issuer: Keypair.random().publicKey() },
  usdc: { code: "USDC", issuer: Keypair.random().publicKey() },
};
const fan = { code: "LUNA", issuer: Keypair.random().publicKey() };
const wallet = Keypair.random().publicKey();
const storage = Keypair.random().publicKey();
const fanWallet = Keypair.random().publicKey();
const artist = { id: "a1", storageAccountId: "s1" as string | null };
const user: SessionUser = {
  id: "u1",
  role: "ARTIST",
  walletAddress: wallet,
  walletType: "frieghter",
  email: null,
};

const base = {
  title: " Cover my song ",
  summary: "Make a cover",
  description: "Details",
  instructions: ["Post a link"],
  requiresActionCam: false,
  prizeAmount: "250",
  prizeCurrency: "BANDCOIN" as const,
  maxWinners: 3,
  fundedFromStorage: false,
};
const track = {
  title: "Hello",
  artistName: "Luna",
  durationSec: 200,
  targetPlays: 3,
  lastFmUrl: "https://www.last.fm/music/Luna/_/Hello",
};

const account = (address: string, bandcoin = "500") => ({
  accountId: () => address,
  sequenceNumber: () => "1",
  subentry_count: 0,
  balances: [
    { asset_type: "native", balance: "100", selling_liabilities: "0" },
    {
      asset_type: "credit_alphanum12",
      asset_code: "BANDCOIN",
      asset_issuer: assets.bandcoin.issuer,
      balance: bandcoin,
      selling_liabilities: "0",
    },
    {
      asset_type: "credit_alphanum4",
      asset_code: fan.code,
      asset_issuer: fan.issuer,
      balance: "1000",
      selling_liabilities: "100",
    },
  ],
});

function setup(
  opts: {
    bounty?: Row | null;
    winners?: Row[];
    joined?: Row | null;
    bandcoin?: string;
    tokenLive?: boolean;
  } = {},
) {
  const written: Row[] = [];
  const bounty =
    opts.bounty === undefined
      ? {
          id: "b1",
          fundTxHash: null,
          status: "RUNNING",
          prizeAmount: "250",
          prizeCurrency: "BANDCOIN",
          maxWinners: 3,
          fundedFromStorage: false,
          escrowContractId: escrow,
        }
      : opts.bounty;
  const db = {
    bounty: {
      create: vi.fn(({ data }: { data: Row }) => {
        written.push(data);
        return Promise.resolve({ id: "b1" });
      }),
      findFirst: vi.fn().mockResolvedValue(bounty),
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        instructions: ["x"],
        musicRule: null,
        prizeAmount: "250",
        maxWinners: 3,
        winners: opts.winners ?? [],
      }),
      findMany: vi.fn().mockResolvedValue([
        {
          id: "b1",
          prizeAmount: { toString: () => "250" },
          fundTxHash: null,
          musicRule: null,
          _count: { participants: 2, submissions: 1, winners: 0 },
        },
      ]),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    event: { findFirst: vi.fn().mockResolvedValue({ id: "e1" }) },
    bountyMusicRule: {
      deleteMany: vi.fn().mockResolvedValue({}),
      upsert: vi.fn().mockResolvedValue({}),
    },
    bountyTrack: { deleteMany: vi.fn().mockResolvedValue({}) },
    bountyTrackProgress: { deleteMany: vi.fn().mockResolvedValue({}) },
    bountyParticipant: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          opts.joined === undefined ? { user: { walletAddress: fanWallet } } : opts.joined,
        ),
    },
    bountyWinner: { create: vi.fn().mockResolvedValue({}) },
    notificationEvent: {
      create: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    follow: { findMany: vi.fn().mockResolvedValue([{ userId: "fan1" }]) },
    chainAccount: { findUnique: vi.fn().mockResolvedValue({ publicKey: storage }) },
    classicToken: { findUnique: vi.fn().mockResolvedValue(fan) },
    $transaction: (run: (tx: unknown) => unknown) => run(db),
  };
  const chain = {
    config: { network, escrowContract: escrow as string | null, assets },
    loadAccount: vi.fn((address: string) => Promise.resolve(account(address, opts.bandcoin))),
    prepareContractCall: vi.fn((xdr: string) => Promise.resolve(xdr)),
    signWithServerKeys: vi.fn((xdr: string) => Promise.resolve(`${xdr}`)),
    signForCustodialUser: vi.fn((xdr: string) => Promise.resolve(xdr)),
    submit: vi.fn().mockResolvedValue({ hash: "tx1" }),
    assetExists: vi.fn().mockResolvedValue(true),
    contractIsLive: vi.fn().mockResolvedValue(opts.tokenLive ?? false),
  };
  const activity = { set: vi.fn(), facts: () => ({}) };
  return {
    ctx: { db: db as unknown as Db, chain: chain as unknown as ChainGateway, activity },
    db,
    chain,
    written,
    activity,
  };
}

const decode = (xdr: string) => {
  const tx = TransactionBuilder.fromXDR(xdr, network.passphrase);
  const op = tx.operations[0] as {
    func:
      | { invokeContract: () => { functionName: () => Buffer } }
      | { invokeContract: { functionName: { toString(): string } } };
  };
  return {
    tx,
    name: (
      op.func as { invokeContract: { functionName: { toString(): string } } }
    ).invokeContract.functionName.toString(),
  };
};

const fundXdr = (over: Partial<Parameters<typeof buildBountyFund>[0]> = {}) =>
  buildBountyFund({
    source: new Account(wallet, "1"),
    network,
    contract: escrow,
    bountyId: "b1",
    creator: wallet,
    token: tokenAddressOf(assetFor("BANDCOIN", assets), network.passphrase),
    amount: 2_500_000_000n,
    maxWinners: 3,
    ...over,
  }).xdr;

describe("creating a bounty", () => {
  it("saves an unfunded draft with its music rule and tracks", async () => {
    const { ctx, written, activity } = setup();
    await expect(
      createBounty(ctx, artist, {
        ...base,
        rewardNote: " Paid in a week ",
        eventId: "e1",
        music: { mode: "HYBRID", ruleType: "ANY_N", requiredTracks: 1, tracks: [track] },
      }),
    ).resolves.toEqual({ bountyId: "b1", tokenSetup: false });
    expect(written[0]).toMatchObject({
      organizationId: "a1",
      title: "Cover my song",
      prizeAmount: "250",
      prizeCurrency: "BANDCOIN",
      maxWinners: 3,
      escrowContractId: escrow,
      rewardNote: "Paid in a week",
      eventId: "e1",
      musicRule: {
        create: { mode: "HYBRID", ruleType: "ANY_N", requiredTracks: 1, totalPlays: null },
      },
    });
    expect(written[0]).not.toHaveProperty("fundTxHash");
    expect(activity.set).toHaveBeenCalledWith({ targetType: "Bounty", targetId: "b1" });
  });

  it("needs the escrow set up, a real prize and sensible winners", async () => {
    const off = setup();
    (off.chain.config as { escrowContract: string | null }).escrowContract = null;
    await expect(createBounty(off.ctx, artist, base)).rejects.toMatchObject({
      message: "Bounties aren't set up yet.",
    });
    await expect(createBounty(setup().ctx, artist, { ...base, prizeAmount: "0" })).rejects.toThrow(
      /prize/i,
    );
    await expect(
      createBounty(setup().ctx, artist, { ...base, prizeAmount: "12.12345678" }),
    ).rejects.toThrow(/prize/i);
    await expect(createBounty(setup().ctx, artist, { ...base, maxWinners: 0 })).rejects.toThrow(
      /winners/,
    );
  });

  it("needs instructions unless the challenge is only listening", async () => {
    await expect(createBounty(setup().ctx, artist, { ...base, instructions: [] })).rejects.toThrow(
      /instruction/,
    );
    const only = setup();
    await createBounty(only.ctx, artist, {
      ...base,
      instructions: ["ignored"],
      music: { mode: "MUSIC_ONLY", ruleType: "ALL", tracks: [track] },
    });
    expect(only.written[0]).toMatchObject({ instructions: [] });
  });

  it("checks the listening rules", async () => {
    const run = (music: Parameters<typeof createBounty>[2]["music"]) =>
      createBounty(setup().ctx, artist, { ...base, music });
    await expect(run({ mode: "HYBRID", ruleType: "ALL", tracks: [] })).rejects.toThrow(
      /at least one track/,
    );
    await expect(
      run({ mode: "HYBRID", ruleType: "ANY_N", requiredTracks: 2, tracks: [track] }),
    ).rejects.toThrow(/how many of the tracks/);
    await expect(run({ mode: "HYBRID", ruleType: "TOTAL_PLAYS", tracks: [track] })).rejects.toThrow(
      /total number of plays/,
    );
    await expect(
      run({
        mode: "HYBRID",
        ruleType: "ALL",
        tracks: [{ ...track, lastFmUrl: "javascript:alert(1)" }],
      }),
    ).rejects.toThrow(/web address/);
    await expect(
      run({ mode: "HYBRID", ruleType: "ALL", tracks: Array.from({ length: 6 }, () => track) }),
    ).rejects.toThrow(/at most 5/);
  });

  it("funds from storage only when the artist has one, and links only their own event", async () => {
    await expect(
      createBounty(
        setup().ctx,
        { ...artist, storageAccountId: null },
        { ...base, fundedFromStorage: true },
      ),
    ).rejects.toThrow(/storage account/);
    const noEvent = setup();
    (noEvent.db.event.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(
      createBounty(noEvent.ctx, artist, { ...base, eventId: "someone-elses" }),
    ).rejects.toThrow(/isn't one of yours/);
  });
});

describe("managing a bounty", () => {
  it("edits the text but never the prize, and replaces tracks (starting progress over)", async () => {
    const { ctx, db } = setup();
    await updateBounty(ctx, artist, {
      bountyId: "b1",
      title: " New title ",
      music: { mode: "HYBRID", ruleType: "ALL", tracks: [track] },
    });
    expect(db.bounty.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: { title: "New title" },
    });
    expect(db.bountyTrackProgress.deleteMany).toHaveBeenCalled();
    expect(db.bountyTrack.deleteMany).toHaveBeenCalledWith({ where: { bountyId: "b1" } });
    expect(db.bountyMusicRule.upsert).toHaveBeenCalled();
  });

  it("only touches the artist's own bounty", async () => {
    const { ctx, db } = setup({ bounty: null });
    await expect(updateBounty(ctx, artist, { bountyId: "x", title: "Hi" })).rejects.toThrow(
      /not found/,
    );
    expect(db.bounty.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "x", organizationId: "a1" } }),
    );
  });

  it("changes status only once funded, and never deletes a funded bounty", async () => {
    await expect(
      setBountyStatus(setup().ctx, artist, { bountyId: "b1", status: "PAUSED" }),
    ).rejects.toThrow(/Fund the bounty first/);
    const funded = setup({
      bounty: {
        id: "b1",
        fundTxHash: "tx0",
        status: "RUNNING",
        prizeAmount: "250",
        prizeCurrency: "BANDCOIN",
        maxWinners: 3,
        fundedFromStorage: false,
        escrowContractId: escrow,
      },
    });
    await setBountyStatus(funded.ctx, artist, { bountyId: "b1", status: "PAUSED" });
    expect(funded.db.bounty.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: { status: "PAUSED" },
    });
    await expect(discardUnfunded(funded.ctx, artist, "b1")).rejects.toThrow(/can't be deleted/);
    const draft = setup();
    await discardUnfunded(draft.ctx, artist, "b1");
    expect(draft.db.bounty.delete).toHaveBeenCalledWith({ where: { id: "b1" } });
  });

  it("lists bounties with their counts and whether they are funded", async () => {
    await expect(listBounties(setup().ctx, artist)).resolves.toEqual([
      {
        id: "b1",
        prizeAmount: "250",
        prize: expect.objectContaining({ amount: "250", code: "BANDCOIN" }) as unknown,
        funded: false,
        hasMusic: false,
        participants: 2,
        submissions: 1,
        winners: 0,
      },
    ]);
  });
});

describe("funding the prize", () => {
  it("builds the old create_bounty call from the artist's wallet", async () => {
    const { ctx, chain } = setup();
    const prepared = await prepareFunding(ctx, artist, user, "b1");
    expect(prepared).toMatchObject({
      signer: "wallet",
      prize: "250.0000000",
      code: "BANDCOIN",
    });
    expect(decode(prepared.xdr).name).toBe("create_bounty");
    expect(chain.prepareContractCall).toHaveBeenCalledWith(expect.any(String), undefined);
  });

  it("has the platform sign for the storage account, and asks for those auth entries", async () => {
    const { ctx, chain } = setup({
      bounty: {
        id: "b1",
        fundTxHash: null,
        status: "RUNNING",
        prizeAmount: "250",
        prizeCurrency: "BANDCOIN",
        maxWinners: 3,
        fundedFromStorage: true,
        escrowContractId: escrow,
      },
    });
    const prepared = await prepareFunding(ctx, artist, user, "b1");
    expect(prepared.signer).toBe("server");
    expect(chain.prepareContractCall).toHaveBeenCalledWith(expect.any(String), [storage]);
  });

  it("refuses when the source can't cover the prize, and when it is already funded", async () => {
    await expect(
      prepareFunding(setup({ bandcoin: "100" }).ctx, artist, user, "b1"),
    ).rejects.toThrow(/enough BANDCOIN/);
    const funded = setup({
      bounty: {
        id: "b1",
        fundTxHash: "tx0",
        status: "RUNNING",
        prizeAmount: "250",
        prizeCurrency: "BANDCOIN",
        maxWinners: 3,
        fundedFromStorage: false,
        escrowContractId: escrow,
      },
    });
    await expect(prepareFunding(funded.ctx, artist, user, "b1")).rejects.toThrow(/already funded/);
  });

  it("submits only the exact funding call, then records the hash", async () => {
    const { ctx, chain, db } = setup();
    await expect(
      submitFunding(ctx, artist, user, "b1", fundXdr({ amount: 100_000_000n })),
    ).rejects.toThrow(/isn't the one we prepared/);
    await expect(
      submitFunding(ctx, artist, user, "b1", fundXdr({ bountyId: "other" })),
    ).rejects.toThrow(/isn't the one we prepared/);
    await expect(
      submitFunding(ctx, artist, user, "b1", fundXdr({ maxWinners: 9 })),
    ).rejects.toThrow(/isn't the one we prepared/);
    expect(chain.submit).not.toHaveBeenCalled();

    await expect(submitFunding(ctx, artist, user, "b1", fundXdr())).resolves.toEqual({
      txHash: "tx1",
    });
    expect(chain.submit).toHaveBeenCalledWith(fundXdr());
    expect(db.bounty.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: { fundTxHash: "tx1" },
    });
    expect(db.notificationEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "BOUNTY", entityId: "b1" }),
    });
  });

  it("signs for custodial artists and for the storage account", async () => {
    const custodial = setup();
    await submitFunding(
      custodial.ctx,
      artist,
      { ...user, walletType: "emailPass", email: "a@example.com" },
      "b1",
      fundXdr(),
    );
    expect(custodial.chain.signForCustodialUser).toHaveBeenCalledWith(fundXdr(), "a@example.com");

    const fromStorage = setup({
      bounty: {
        id: "b1",
        fundTxHash: null,
        status: "RUNNING",
        prizeAmount: "250",
        prizeCurrency: "BANDCOIN",
        maxWinners: 3,
        fundedFromStorage: true,
        escrowContractId: escrow,
      },
    });
    const xdr = fundXdr({ source: new Account(storage, "1"), creator: storage });
    await submitFunding(fromStorage.ctx, artist, user, "b1", xdr);
    expect(fromStorage.chain.signWithServerKeys).toHaveBeenCalledWith(xdr, [storage]);
  });

  it("shows what the wallet and the storage account hold", async () => {
    const { ctx } = setup();
    const sources = await fundingSources(ctx, { ...artist, fanTokenItemId: "fan" }, user);
    expect(sources.fanToken).toEqual(fan);
    expect(sources.wallet?.BANDCOIN).toBe("500.0000000");
    expect(sources.storage?.BANDCOIN).toBe("500.0000000");
    expect(sources.wallet?.others).toEqual([
      { code: "LUNA", issuer: fan.issuer, amount: "900.0000000" },
    ]);
    expect(
      (await fundingSources(ctx, { ...artist, storageAccountId: null, fanTokenItemId: null }, user))
        .storage,
    ).toBeNull();
  });
});

describe("a prize in the artist's own token", () => {
  const fanBounty = {
    id: "b1",
    fundTxHash: null,
    status: "RUNNING",
    prizeAmount: "250",
    prizeCurrency: null,
    prizeAssetCode: fan.code,
    prizeAssetIssuer: fan.issuer,
    maxWinners: 3,
    fundedFromStorage: false,
    escrowContractId: escrow,
  };
  const setupXdr = (asset = new Asset(fan.code, fan.issuer), source = wallet) =>
    buildAssetContractSetup({ source: new Account(source, "1"), network, asset }).xdr;

  it("stores the token, or the currency when the token is really BANDCOIN", async () => {
    const { ctx, written, chain } = setup();
    const { prizeCurrency: _, ...rest } = base;
    await expect(createBounty(ctx, artist, { ...rest, prizeAsset: fan })).resolves.toEqual({
      bountyId: "b1",
      tokenSetup: true,
    });
    expect(written[0]).toMatchObject({
      prizeCurrency: null,
      prizeAssetCode: "LUNA",
      prizeAssetIssuer: fan.issuer,
    });
    expect(chain.assetExists).toHaveBeenCalledWith("LUNA", fan.issuer);

    await createBounty(ctx, artist, { ...rest, prizeAsset: assets.bandcoin });
    expect(written[1]).toMatchObject({ prizeCurrency: "BANDCOIN", prizeAssetCode: null });
    await expect(createBounty(ctx, artist, { ...base, prizeAsset: fan })).rejects.toThrow(
      /Choose what the prize is paid in/,
    );
  });

  it("asks for the token's one-time setup before funding", async () => {
    const { ctx } = setup({ bounty: fanBounty });
    await expect(prepareFunding(ctx, artist, user, "b1")).rejects.toThrow(
      /Set up LUNA for escrow first/,
    );
  });

  it("builds and submits only the setup for this token, from the funding account", async () => {
    const { ctx, chain } = setup({ bounty: fanBounty });
    const prepared = await prepareTokenSetup(ctx, artist, user, "b1");
    expect(prepared).toMatchObject({ signer: "wallet", code: "LUNA" });
    const op = TransactionBuilder.fromXDR(prepared.xdr, network.passphrase).operations[0] as {
      func: { type: string };
    };
    expect(op.func.type).toBe("hostFunctionTypeCreateContract");

    const other = new Asset("OTHER", Keypair.random().publicKey());
    await expect(submitTokenSetup(ctx, artist, user, "b1", setupXdr(other))).rejects.toThrow(
      /isn't the one we prepared/,
    );
    await expect(
      submitTokenSetup(ctx, artist, user, "b1", setupXdr(undefined, storage)),
    ).rejects.toThrow(/isn't the one we prepared/);
    await expect(submitTokenSetup(ctx, artist, user, "b1", fundXdr())).rejects.toThrow(
      /isn't the one we prepared/,
    );
    expect(chain.submit).not.toHaveBeenCalled();
    await expect(submitTokenSetup(ctx, artist, user, "b1", setupXdr())).resolves.toEqual({
      txHash: "tx1",
    });
  });

  it("once set up, escrows the token through its asset contract", async () => {
    const { ctx } = setup({ bounty: fanBounty, tokenLive: true });
    await expect(prepareTokenSetup(ctx, artist, user, "b1")).rejects.toThrow(/already set up/);
    const prepared = await prepareFunding(ctx, artist, user, "b1");
    expect(prepared.code).toBe("LUNA");
    const token = tokenAddressOf(new Asset(fan.code, fan.issuer), network.passphrase);
    await expect(submitFunding(ctx, artist, user, "b1", fundXdr({ token }))).resolves.toEqual({
      txHash: "tx1",
    });
    await expect(submitFunding(ctx, artist, user, "b1", fundXdr())).rejects.toThrow(
      /isn't the one we prepared/,
    );
  });

  it("counts only what isn't locked in offers", async () => {
    const { ctx } = setup({ bounty: { ...fanBounty, prizeAmount: "950" }, tokenLive: true });
    await expect(prepareFunding(ctx, artist, user, "b1")).rejects.toThrow(
      /enough LUNA to fund it. You have 900.0000000/,
    );
  });
});

describe("picking winners", () => {
  const funded = {
    id: "b1",
    fundTxHash: "tx0",
    status: "RUNNING",
    prizeAmount: "250",
    prizeCurrency: "BANDCOIN",
    maxWinners: 3,
    fundedFromStorage: false,
    escrowContractId: escrow,
  };
  const winnerXdr = (amount = 1_000_000_000n, winner = fanWallet) =>
    buildBountySelectWinner({
      source: new Account(wallet, "1"),
      network,
      contract: escrow,
      bountyId: "b1",
      caller: wallet,
      winner,
      amount,
    }).xdr;

  it("builds the old select_winner call for a fan who joined", async () => {
    const prepared = await prepareWinner(setup({ bounty: funded }).ctx, artist, user, {
      bountyId: "b1",
      winnerUserId: "fan1",
      amount: "100",
    });
    expect(decode(prepared.xdr).name).toBe("select_winner");
    expect(prepared.signer).toBe("wallet");
  });

  it("refuses an unfunded bounty, a fan who hasn't joined, too much, and too many winners", async () => {
    const input = { bountyId: "b1", winnerUserId: "fan1", amount: "100" };
    await expect(prepareWinner(setup().ctx, artist, user, input)).rejects.toThrow(
      /Fund the bounty first/,
    );
    await expect(
      prepareWinner(setup({ bounty: funded, joined: null }).ctx, artist, user, input),
    ).rejects.toThrow(/hasn't joined/);
    await expect(
      prepareWinner(
        setup({ bounty: funded, joined: { user: { walletAddress: null } } }).ctx,
        artist,
        user,
        input,
      ),
    ).rejects.toThrow(/no wallet/);
    await expect(
      prepareWinner(setup({ bounty: funded }).ctx, artist, user, { ...input, amount: "300" }),
    ).rejects.toThrow(/Only 250.0000000 is left/);
    await expect(
      prepareWinner(setup({ bounty: funded }).ctx, artist, user, { ...input, amount: "0" }),
    ).rejects.toThrow(/more than 0/);
    await expect(
      prepareWinner(
        setup({ bounty: funded, winners: [{ userId: "fan1", prizeAmount: "10" }] }).ctx,
        artist,
        user,
        input,
      ),
    ).rejects.toThrow(/already a winner/);
    const full = [1, 2, 3].map((n) => ({ userId: `w${n}`, prizeAmount: "10" }));
    await expect(
      prepareWinner(setup({ bounty: funded, winners: full }).ctx, artist, user, input),
    ).rejects.toThrow(/All the winners/);
  });

  it("counts what earlier winners took", async () => {
    const earlier = setup({ bounty: funded, winners: [{ userId: "w1", prizeAmount: "200" }] });
    await expect(
      prepareWinner(earlier.ctx, artist, user, {
        bountyId: "b1",
        winnerUserId: "fan1",
        amount: "60",
      }),
    ).rejects.toThrow(/Only 50.0000000 is left/);
  });

  it("submits only that exact pick, records the winner and tells them", async () => {
    const { ctx, chain, db } = setup({ bounty: funded });
    const input = { bountyId: "b1", winnerUserId: "fan1", amount: "100" };
    await expect(
      submitWinner(ctx, artist, user, { ...input, xdr: winnerXdr(2_000_000_000n) }),
    ).rejects.toThrow(/isn't the one we prepared/);
    await expect(
      submitWinner(ctx, artist, user, {
        ...input,
        xdr: winnerXdr(1_000_000_000n, Keypair.random().publicKey()),
      }),
    ).rejects.toThrow(/isn't the one we prepared/);
    expect(chain.submit).not.toHaveBeenCalled();

    await expect(submitWinner(ctx, artist, user, { ...input, xdr: winnerXdr() })).resolves.toEqual({
      txHash: "tx1",
    });
    expect(db.bountyWinner.create).toHaveBeenCalledWith({
      data: { bountyId: "b1", userId: "fan1", prizeAmount: "100.0000000", txHash: "tx1" },
    });
    expect(db.notificationEvent.create).toHaveBeenCalledWith({
      data: {
        type: "BOUNTY_WINNER",
        actorId: "u1",
        entityId: "b1",
        notifications: {
          createMany: { data: [{ recipientId: "fan1", isForArtist: false }] },
        },
      },
    });
  });
});

describe("Last.fm track search", () => {
  it("picks the biggest real picture and ignores the grey star", () => {
    expect(
      artworkOf([
        { "#text": "https://img/small.png", size: "small" },
        { "#text": "https://img/2a96cbd8b46e442fc41c2b86b821562f.png", size: "extralarge" },
        { "#text": "https://img/large.png", size: "large" },
      ]),
    ).toBe("https://img/large.png");
    expect(
      artworkOf([{ "#text": "https://img/2a96cbd8b46e442fc41c2b86b821562f.png", size: "large" }]),
    ).toBeNull();
    expect(artworkOf(undefined)).toBeNull();
  });

  it("turns a search into tracks, and gives back nothing when Last.fm fails", async () => {
    vi.stubEnv("LASTFM_API_KEY", "key");
    const ok = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          results: {
            trackmatches: {
              track: {
                name: "Hello",
                artist: "Luna",
                url: "https://www.last.fm/x",
                image: [{ "#text": "https://img/a.png", size: "large" }],
              },
            },
          },
        }),
    });
    await expect(searchTracks("hello", ok as unknown as typeof fetch)).resolves.toEqual([
      {
        id: "0-Hello",
        title: "Hello",
        artistName: "Luna",
        albumArtUrl: "https://img/a.png",
        durationSec: 180,
        lastFmUrl: "https://www.last.fm/x",
      },
    ]);
    await expect(
      searchTracks("hello", vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch),
    ).resolves.toEqual([]);
    await expect(searchTracks("  ")).resolves.toEqual([]);
    vi.unstubAllEnvs();
  });
});
