import { Keypair } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import type { SessionUser } from "../context";
import { createNft } from "../services/artist/nft";
import type { ChainGateway } from "../services/chain-gateway";
import type { LockedContentInput } from "../services/artist/locked-content";

vi.mock("@actiontokens/storage", () => ({
  isOwnS3Url: (url: string) => url.startsWith("https://cdn.example/"),
}));

const wallet = Keypair.random();
const contract = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const artist = { id: "a1", slug: "luna-vale", userId: "u1", issuerAccountId: "chain1" };
const me: SessionUser = {
  id: "u1",
  role: "ARTIST",
  walletAddress: wallet.publicKey(),
  walletType: "freighter",
};

const input: Parameters<typeof createNft>[3] & { lockedContents: LockedContentInput[] } = {
  type: "IMAGE" as const,
  title: "Night Drive",
  description: "A print",
  coverUrl: "https://cdn.example/cover.jpg",
  media: { url: "https://cdn.example/art.png", mediaType: "IMAGE" as const },
  supply: 50,
  priceActionToken: "25",
  priceUsd: "0.5",
  resaleRoyaltyPercent: "5",
  visibility: "DRAFT",
  lockedContents: [
    { type: "SONG" as const, url: "https://cdn.example/bonus.mp3", label: "Bonus track" },
    {
      type: "OTHER" as const,
      url: "https://tickets.example/vip",
      label: "VIP pass",
      unlock: {
        radiusMeters: 80,
        places: [
          { lat: 23.78, lng: 90.4, label: "Gate A" },
          { lat: 23.79, lng: 90.41 },
        ],
      },
    },
  ],
};

type Row = Record<string, unknown>;

function setup(opts: { contract?: string | null } = {}) {
  const created: Row[] = [];
  const db = {
    item: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(({ data }: { data: Row }) => {
        created.push(data);
        return Promise.resolve({ id: "i1", slug: data.slug });
      }),
    },
  };
  const chain = {
    config: { nftContract: opts.contract === undefined ? contract : opts.contract },
  };
  const activity = { set: vi.fn(), facts: () => ({}) };
  return {
    ctx: { db: db as unknown as Db, chain: chain as unknown as ChainGateway, activity },
    created,
  };
}

describe("createNft", () => {
  it("saves a contract NFT as a draft: nothing on the contract until its first sale", async () => {
    const { ctx, created } = setup();
    await expect(createNft(ctx, artist, me, input)).resolves.toEqual({
      itemId: "i1",
      slug: "luna-vale-night-drive",
    });
    expect(created[0]).toMatchObject({
      chainType: "CONTRACT_NFT",
      visibility: "DRAFT",
      supply: 50,
      contractNft: { create: { contractAddress: contract, royaltyBps: 500, status: "PENDING" } },
      listings: {
        create: { kind: "PRIMARY", status: "PAUSED", priceActionToken: "25", priceUsd: "0.5" },
      },
    });
    expect(created[0]!.classicToken).toBeUndefined();
  });

  it("goes on sale at once when published", async () => {
    const { ctx, created } = setup();
    await createNft(ctx, artist, me, { ...input, visibility: "PUBLIC" });
    expect(created[0]).toMatchObject({
      visibility: "PUBLIC",
      listings: { create: { status: "ACTIVE" } },
    });
  });

  it("needs a fixed number of copies, a sane resale royalty and a configured contract", async () => {
    await expect(createNft(setup().ctx, artist, me, { ...input, supply: 0 })).rejects.toMatchObject(
      { message: "Use a whole number from 1 to 100,000." },
    );
    await expect(
      createNft(setup().ctx, artist, me, { ...input, resaleRoyaltyPercent: "91" }),
    ).rejects.toMatchObject({
      message: "Resale royalty can be from 0 to 90%.",
    });
    await expect(createNft(setup({ contract: null }).ctx, artist, me, input)).rejects.toMatchObject(
      {
        message: "Contract NFTs aren't set up on this server yet.",
      },
    );
  });

  it("shares the classic item rules: own storage, a file for art, prices", async () => {
    await expect(
      createNft(setup().ctx, artist, me, { ...input, coverUrl: "https://evil.example/c.jpg" }),
    ).rejects.toMatchObject({ message: "Upload the cover again." });
    await expect(
      createNft(setup().ctx, artist, me, { ...input, media: undefined }),
    ).rejects.toMatchObject({ message: "Add the file people will get." });
    await expect(
      createNft(setup().ctx, artist, me, { ...input, priceActionToken: "0" }),
    ).rejects.toMatchObject({ message: "Enter a price above zero" });
  });
});

describe("locked content", () => {
  it("saves each piece in order, with its places, and fixes its chain index", async () => {
    const { ctx, created } = setup();
    await createNft(ctx, artist, me, input);
    expect(created[0]!.lockedContents).toEqual({
      create: [
        {
          type: "SONG",
          url: "https://cdn.example/bonus.mp3",
          label: "Bonus track",
          sortOrder: 0,
          chainIndex: 0,
        },
        {
          type: "OTHER",
          url: "https://tickets.example/vip",
          label: "VIP pass",
          sortOrder: 1,
          chainIndex: 1,
          unlockRule: {
            create: {
              radiusMeters: 80,
              points: {
                create: [
                  { latitude: 23.78, longitude: 90.4, label: "Gate A", sortOrder: 0 },
                  { latitude: 23.79, longitude: 90.41, label: null, sortOrder: 1 },
                ],
              },
            },
          },
        },
      ],
    });
  });

  it("refuses what the form would block", async () => {
    const song = input.lockedContents[0]!;
    const gated = input.lockedContents[1]!;
    const cases: [LockedContentInput[], string][] = [
      [[], "Add at least one piece of locked content."],
      [Array.from({ length: 21 }, () => song), "Up to 20 pieces of locked content."],
      [[{ ...song, url: "https://evil.example/x.mp3" }], "Locked item 1: upload the file again."],
      [
        [song, { ...gated, url: "javascript:alert(1)" }],
        "Locked item 2: enter a web link starting with https://.",
      ],
      [
        [{ ...gated, unlock: { radiusMeters: 50, places: [] } }],
        "Locked item 1: add at least one place, or turn the condition off.",
      ],
      [
        [{ ...gated, unlock: { radiusMeters: 5, places: gated.unlock!.places } }],
        "Locked item 1: the radius can be from 10 to 1000 m.",
      ],
      [
        [{ ...gated, unlock: { radiusMeters: 50, places: [{ lat: 95, lng: 0 }] } }],
        "Locked item 1: one of the places isn't on the map.",
      ],
    ];
    for (const [lockedContents, message] of cases)
      await expect(
        createNft(setup().ctx, artist, me, { ...input, lockedContents }),
      ).rejects.toMatchObject({ message });
  });
});
