import { describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import { createContext } from "../context";
import { appRouter } from "../root-app";
import { SHELF } from "../routers/app/catalog";
import type { ChainGateway } from "../services/chain-gateway";
import { createCallerFactory } from "../trpc";

/** An organization row as the shelf query selects it. */
const org = (n: number) => ({
  id: `o${n}`,
  name: `Org ${n}`,
  slug: `org-${n}`,
  avatarUrl: null,
  coverUrl: null,
  bio: null,
  _count: { followers: 10 - n, items: 2 },
  fanTokenItem: null,
});

function caller(total: number) {
  const findMany = vi.fn(async (args: { skip: number; take: number }) =>
    Array.from({ length: total }, (_, i) => org(i)).slice(args.skip, args.skip + args.take),
  );
  const db = { organization: { findMany } } as unknown as Db;
  const call = createCallerFactory(appRouter)(
    createContext({ db, chain: {} as ChainGateway, app: "app", session: null }),
  );
  return { call, findMany };
}

describe("catalog.shelf", () => {
  it("serves 10 cards a batch and says whether another page follows", async () => {
    const { call, findMany } = caller(SHELF + 3);
    const first = await call.catalog.shelf({ shelf: "artists", page: 0 });
    expect(first.items).toHaveLength(SHELF);
    expect(first.hasMore).toBe(true);
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ skip: 0, take: SHELF + 1 }),
    );

    const second = await call.catalog.shelf({ shelf: "artists", page: 1 });
    expect(second.items.map((item) => item.id)).toEqual(["o10", "o11", "o12"]);
    expect(second.hasMore).toBe(false);
    expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: SHELF }));
  });

  it("has no next page when the shelf fills exactly one page", async () => {
    const { call } = caller(SHELF);
    await expect(call.catalog.shelf({ shelf: "artists", page: 0 })).resolves.toMatchObject({
      hasMore: false,
    });
  });

  it("rejects pages outside the range", async () => {
    const { call } = caller(1);
    await expect(call.catalog.shelf({ shelf: "artists", page: -1 })).rejects.toThrow();
  });
});
