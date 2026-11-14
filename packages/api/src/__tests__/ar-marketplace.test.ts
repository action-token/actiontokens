import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import { createContext } from "../context";
import { arRouter } from "../root-ar";
import type { ChainGateway } from "../services/chain-gateway";
import { createCallerFactory } from "../trpc";

describe("the AR app's marketplace", () => {
  it("lets a signed-out visitor browse items", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const caller = createCallerFactory(arRouter)(
      createContext({
        db: { item: { findMany } } as unknown as Db,
        chain: {} as ChainGateway,
        app: "ar",
        session: null,
        headers: new Headers(),
      }),
    );
    const page = await caller.catalog.browse({ type: "TRACK", search: "moon" });
    expect(page).toEqual({ items: [], nextCursor: undefined });
    expect(findMany).toHaveBeenCalledOnce();
  });

  it("exposes the item page's read, and nothing that sells", () => {
    expect(Object.keys(arRouter._def.procedures)).toContain("item.bySlug");
    expect(Object.keys(arRouter._def.procedures).some((k) => k.startsWith("order."))).toBe(false);
  });
});
