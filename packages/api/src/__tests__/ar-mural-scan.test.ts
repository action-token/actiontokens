import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import { nameMural, startScan, submitScan } from "../services/ar/mural-scan";

const clip = vi.hoisted(() => ({ score: 0.8, vector: [1, 0] }));
vi.mock("../services/ar/clip", () => ({
  embedImage: () => Promise.resolve(clip.vector),
  muralScore: () => ({ score: clip.score }),
  dot: (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + v * (b[i] ?? 0), 0),
}));
const vision = vi.hoisted(() => ({
  result: { ok: true, report: { units: 4 } } as Record<string, unknown>,
}));
vi.mock("../services/ar/vision", () => ({ checkWithVision: () => Promise.resolve(vision.result) }));
vi.mock("@actiontokens/storage", () => ({
  getObjectBytes: () => Promise.resolve(Buffer.from([0xff, 0xd8, 1, 2])),
  publicS3Url: (key: string) => `https://cdn/${key}`,
  signMuralFrames: (_id: string, n: number) =>
    Promise.resolve(
      Array.from({ length: n }, (_, i) => ({ key: `f${i}`, uploadUrl: `https://up/${i}` })),
    ),
}));
vi.mock("../services/ar/murals", async (original) => ({
  ...(await original<typeof import("../services/ar/murals")>()),
  autoTitleFor: () => Promise.resolve("Mural on Canal St"),
}));

const here = { lat: 40.72, lng: -74.0 };
const settings = {
  id: 1,
  coinsPerScan: 10,
  discoveryBonus: 50,
  dailyScansPerMural: 3,
  confirmationsNeeded: 3,
};
const goodInput = {
  sessionId: "s1",
  ...here,
  accuracy: 10,
  sweep: { spanDeg: 30, durationMs: 3000 },
  platform: "web" as const,
};

function muralRow(over: Record<string, unknown> = {}) {
  return {
    id: "m1",
    autoTitle: "Mural on Canal St",
    title: null,
    artistName: null,
    coverUrl: "https://cdn/f1",
    latitude: here.lat,
    longitude: here.lng,
    status: "DISCOVERED",
    distinctScanners: 0,
    scanCount: 0,
    embeddings: [] as { vector: number[] }[],
    ...over,
  };
}

function setup(
  opts: {
    existing?: ReturnType<typeof muralRow> | null;
    myScansOfMural?: number;
    todays?: number;
    session?: Record<string, unknown>;
  } = {},
) {
  let mural = opts.existing ?? null;
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    mural: {
      findMany: vi.fn(() => Promise.resolve(mural ? [mural] : [])),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        mural = muralRow({ ...data, id: "new" });
        return Promise.resolve(mural);
      }),
      findUniqueOrThrow: vi.fn(() => Promise.resolve(mural)),
      update: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        mural = { ...mural!, ...data, scanCount: mural!.scanCount + 1 } as typeof mural;
        return Promise.resolve(mural);
      }),
    },
    muralScan: {
      count: vi.fn(({ where }: { where: { localDay?: string } }) =>
        Promise.resolve(where.localDay ? (opts.todays ?? 0) : (opts.myScansOfMural ?? 0)),
      ),
      create: vi.fn().mockResolvedValue({ id: "scan1" }),
    },
    coinLedgerEntry: { create: vi.fn().mockResolvedValue({}) },
    coinBalance: {
      upsert: vi.fn().mockResolvedValueOnce({ balance: 10 }).mockResolvedValueOnce({ balance: 60 }),
    },
    muralEmbedding: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
  };
  const db = {
    ...tx,
    muralSettings: { upsert: vi.fn().mockResolvedValue(settings) },
    muralScanSession: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({ id: "s1", startedAt: new Date() }),
      update: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue({
        id: "s1",
        userId: "me",
        startedAt: new Date(),
        finishedAt: null,
        latitude: here.lat,
        longitude: here.lng,
        frameKeys: ["f0", "f1", "f2"],
        ...opts.session,
      }),
    },
    $transaction: (run: (t: typeof tx) => unknown) => run(tx),
  };
  return {
    db,
    tx,
    finished: () =>
      db.muralScanSession.update.mock.calls.at(-1)?.[0] as { data: Record<string, unknown> },
  };
}

beforeEach(() => {
  clip.score = 0.8;
  vision.result = { ok: true, report: { units: 4 } };
});

describe("startScan", () => {
  it("opens a session with three signed uploads", async () => {
    const { db } = setup();
    const result = await startScan(db as unknown as Db, "me", { ...here, accuracy: 10 });
    expect(result).toMatchObject({
      ok: true,
      sessionId: "s1",
      limits: { coinsPerScan: 10, discoveryBonus: 50, dailyScansPerMural: 3 },
    });
    expect(result.ok && result.frames).toHaveLength(3);
  });

  it("refuses weak GPS and too many scans an hour", async () => {
    await expect(
      startScan(setup().db as unknown as Db, "me", { ...here, accuracy: 500 }),
    ).resolves.toMatchObject({ ok: false, code: "GPS_WEAK" });
    const busy = setup();
    busy.db.muralScanSession.count.mockResolvedValue(30);
    await expect(
      startScan(busy.db as unknown as Db, "me", { ...here, accuracy: 10 }),
    ).resolves.toMatchObject({ ok: false, code: "RATE_LIMIT" });
  });
});

describe("submitScan", () => {
  it("discovers a new mural: scan coins plus the discovery bonus, recorded on the session", async () => {
    const { db, tx, finished } = setup();
    const result = await submitScan(db as unknown as Db, "me", goodInput);
    expect(result).toMatchObject({
      kind: "discovered",
      rank: 1,
      coins: 10,
      bonus: 50,
      balance: 60,
      canName: true,
    });
    expect(tx.mural.create.mock.calls[0]?.[0]).toMatchObject({
      data: { autoTitle: "Mural on Canal St", discovererId: "me", coverUrl: "https://cdn/f1" },
    });
    expect(
      tx.coinLedgerEntry.create.mock.calls.map(
        (call) => (call[0] as { data: { reason: string; amount: number } }).data,
      ),
    ).toEqual([
      expect.objectContaining({ reason: "MURAL_SCAN", amount: 10 }),
      expect.objectContaining({ reason: "MURAL_DISCOVERY", amount: 50, note: "Discoverer #1" }),
    ]);
    expect(finished().data).toMatchObject({ outcome: "accepted", costUnits: 4, scanId: "scan1" });
  });

  it("collects a known mural without a bonus once it's confirmed", async () => {
    const known = muralRow({
      distinctScanners: 5,
      status: "APPROVED",
      embeddings: [{ vector: [1, 0] }],
    });
    const { db, tx } = setup({ existing: known, myScansOfMural: 2 });
    await expect(submitScan(db as unknown as Db, "me", goodInput)).resolves.toMatchObject({
      kind: "collected",
      coins: 10,
    });
    expect(tx.mural.create).not.toHaveBeenCalled();
    expect(tx.coinLedgerEntry.create).toHaveBeenCalledTimes(1);
  });

  it("sends a mural to the admin queue when enough people have found it", async () => {
    const { db, tx } = setup({
      existing: muralRow({ distinctScanners: 2, embeddings: [{ vector: [1, 0] }] }),
    });
    await submitScan(db as unknown as Db, "me", goodInput);
    expect(tx.mural.update.mock.calls[0]?.[0]).toMatchObject({
      data: { distinctScanners: 3, status: "PENDING" },
    });
  });

  it("turns away scans that fail a check, cheapest first, and pays nothing", async () => {
    const cases: [Partial<typeof goodInput> & Record<string, unknown>, string][] = [
      [{ sweep: { spanDeg: 5, durationMs: 3000 } }, "NO_SWEEP"],
      [{ lat: here.lat + 0.01 }, "GPS_WEAK"],
      [{ mock: true }, "GPS_WEAK"],
    ];
    for (const [over, code] of cases) {
      const { db, tx } = setup();
      await expect(
        submitScan(db as unknown as Db, "me", { ...goodInput, ...over }),
      ).resolves.toMatchObject({ kind: "rejected", code });
      expect(tx.coinLedgerEntry.create).not.toHaveBeenCalled();
    }

    clip.score = 0.1;
    await expect(submitScan(setup().db as unknown as Db, "me", goodInput)).resolves.toMatchObject({
      code: "NOT_ART",
    });

    clip.score = 0.8;
    vision.result = { ok: false, code: "SCREEN", report: { units: 4 } };
    const screen = setup();
    await expect(submitScan(screen.db as unknown as Db, "me", goodInput)).resolves.toMatchObject({
      code: "SCREEN",
    });
    expect(screen.finished().data).toMatchObject({ outcome: "SCREEN", costUnits: 4 });
  });

  it("enforces the daily limit per mural and refuses rejected murals", async () => {
    const known = muralRow({ embeddings: [{ vector: [1, 0] }] });
    await expect(
      submitScan(setup({ existing: known, todays: 3 }).db as unknown as Db, "me", goodInput),
    ).resolves.toMatchObject({ code: "DAILY_LIMIT" });
    await expect(
      submitScan(
        setup({ existing: { ...known, status: "REJECTED" } }).db as unknown as Db,
        "me",
        goodInput,
      ),
    ).resolves.toMatchObject({
      code: "MURAL_REJECTED",
    });
  });

  it("won't take someone else's session, a submitted one, or an expired one", async () => {
    await expect(
      submitScan(setup({ session: { userId: "other" } }).db as unknown as Db, "me", goodInput),
    ).rejects.toMatchObject({ message: "Unknown scan" });
    await expect(
      submitScan(
        setup({ session: { finishedAt: new Date() } }).db as unknown as Db,
        "me",
        goodInput,
      ),
    ).rejects.toMatchObject({
      message: "This scan was already submitted",
    });
    await expect(
      submitScan(
        setup({ session: { startedAt: new Date(Date.now() - 10 * 60_000) } }).db as unknown as Db,
        "me",
        goodInput,
      ),
    ).resolves.toMatchObject({
      code: "SESSION_EXPIRED",
    });
  });
});

describe("nameMural", () => {
  it("lets only a first finder name it, and only once", async () => {
    const db = {
      muralScan: { findFirst: vi.fn().mockResolvedValue(null) },
      mural: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue({ title: "Waves", artistName: "Ana", namedById: "me" }),
      },
    };
    await expect(
      nameMural(db as unknown as Db, "me", { muralId: "m1", title: "Waves" }),
    ).rejects.toMatchObject({ message: "Only the first finders can name this mural" });

    db.muralScan.findFirst.mockResolvedValue({ id: "scan1" });
    await expect(
      nameMural(db as unknown as Db, "me", { muralId: "m1", title: "Waves", artist: "Ana" }),
    ).resolves.toEqual({
      named: true,
      title: "Waves",
      artist: "Ana",
      namedById: "me",
    });
    expect(db.mural.updateMany).toHaveBeenCalledWith({
      where: { id: "m1", title: null, status: { not: "REJECTED" } },
      data: { title: "Waves", artistName: "Ana", namedById: "me" },
    });
  });
});
