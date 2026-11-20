import { describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import {
  currentSlugFor,
  handleOf,
  setProfileImage,
  updateProfile,
  websiteOf,
  type ProfileInput,
} from "../services/artist/profile";

vi.mock("@actiontokens/storage", () => ({
  isOwnS3Url: (url: string) => url.startsWith("https://cdn.example/"),
}));

type Row = Record<string, unknown>;

/** Artists by id, and the history of old slugs, in memory. */
function setup(opts: { artists?: Row[]; history?: Row[] } = {}) {
  const artists = new Map<string, Row>(
    (opts.artists ?? [{ id: "a1", slug: "luna-vale", status: "APPROVED" }]).map((row) => [
      row.id as string,
      { ...row },
    ]),
  );
  const history = new Map<string, Row>(
    (opts.history ?? []).map((row) => [row.slug as string, { ...row }]),
  );
  const bySlug = (slug: string) => [...artists.values()].find((row) => row.slug === slug) ?? null;

  const db = {
    organization: {
      findUnique: vi.fn(({ where }: { where: { slug: string } }) =>
        Promise.resolve(bySlug(where.slug)),
      ),
      update: vi.fn(({ where, data }: { where: { id: string }; data: Row }) => {
        Object.assign(artists.get(where.id)!, data);
        return Promise.resolve(artists.get(where.id));
      }),
    },
    organizationSlugHistory: {
      findUnique: vi.fn(({ where, select }: { where: { slug: string }; select: Row }) => {
        const row = history.get(where.slug);
        if (!row) return Promise.resolve(null);
        return Promise.resolve(
          select.organization ? { organization: artists.get(row.organizationId as string) } : row,
        );
      }),
      deleteMany: vi.fn(({ where }: { where: { slug: string; organizationId: string } }) => {
        if (history.get(where.slug)?.organizationId === where.organizationId) history.delete(where.slug);
        return Promise.resolve({ count: 1 });
      }),
      upsert: vi.fn(({ create }: { create: Row }) => {
        if (!history.has(create.slug as string)) history.set(create.slug as string, create);
        return Promise.resolve(create);
      }),
    },
    $transaction: vi.fn((run: (tx: unknown) => Promise<unknown>) => run(db)),
  };
  const activity = { set: vi.fn() };
  const ctx = { db: db as unknown as Db, activity } as unknown as Parameters<
    typeof updateProfile
  >[0];
  return { ctx, db, artists, history, activity };
}

const input = (over: Partial<ProfileInput> = {}): ProfileInput => ({
  name: "Luna Vale",
  bio: "",
  website: "",
  twitter: "",
  instagram: "",
  ...over,
});

describe("artist profile", () => {
  it("saves the details without touching the address when the name keeps its slug", async () => {
    const { ctx, artists, history, activity } = setup();
    const result = await updateProfile(
      ctx,
      { id: "a1", slug: "luna-vale" },
      input({ bio: "  Dream pop  ", twitter: "https://x.com/lunavale", website: "luna.fm" }),
    );
    expect(result).toEqual({ slug: "luna-vale" });
    expect(artists.get("a1")).toMatchObject({
      bio: "Dream pop",
      twitter: "lunavale",
      website: "https://luna.fm/",
      slug: "luna-vale",
    });
    expect(history.size).toBe(0);
    expect(activity.set).toHaveBeenCalledWith({ targetType: "Artist", targetId: "a1" });
  });

  it("moves the address with the name and keeps the old one for redirects", async () => {
    const { ctx, artists, history } = setup();
    const result = await updateProfile(
      ctx,
      { id: "a1", slug: "luna-vale" },
      input({ name: "Luna Vale Band" }),
    );
    expect(result).toEqual({ slug: "luna-vale-band" });
    expect(artists.get("a1")?.slug).toBe("luna-vale-band");
    expect(history.get("luna-vale")).toMatchObject({ organizationId: "a1" });
    await expect(currentSlugFor(ctx, "luna-vale")).resolves.toBe("luna-vale-band");
  });

  it("lets an artist take back one of their own old addresses", async () => {
    const { ctx, artists, history } = setup({
      artists: [{ id: "a1", slug: "luna-vale-band", status: "APPROVED" }],
      history: [{ slug: "luna-vale", organizationId: "a1" }],
    });
    await updateProfile(ctx, { id: "a1", slug: "luna-vale-band" }, input());
    expect(artists.get("a1")?.slug).toBe("luna-vale");
    expect(history.has("luna-vale")).toBe(false);
    expect(history.get("luna-vale-band")).toMatchObject({ organizationId: "a1" });
  });

  it("refuses an address another artist uses now or used before", async () => {
    const now = setup({
      artists: [
        { id: "a1", slug: "luna-vale", status: "APPROVED" },
        { id: "a2", slug: "nova", status: "APPROVED" },
      ],
    });
    await expect(
      updateProfile(now.ctx, { id: "a1", slug: "luna-vale" }, input({ name: "Nova" })),
    ).rejects.toMatchObject({ code: "RESOURCE_CONFLICT" });

    const before = setup({ history: [{ slug: "nova", organizationId: "a2" }] });
    await expect(
      updateProfile(before.ctx, { id: "a1", slug: "luna-vale" }, input({ name: "Nova" })),
    ).rejects.toMatchObject({ code: "RESOURCE_CONFLICT" });
    expect(before.db.$transaction).not.toHaveBeenCalled();
  });

  it("checks the name, bio and reserved addresses", async () => {
    const { ctx, db } = setup();
    const artist = { id: "a1", slug: "luna-vale" };
    await expect(updateProfile(ctx, artist, input({ name: "Lu" }))).rejects.toThrow(/3 to 98/);
    await expect(updateProfile(ctx, artist, input({ bio: "x".repeat(201) }))).rejects.toThrow(
      /200/,
    );
    await expect(updateProfile(ctx, artist, input({ name: "Music" }))).rejects.toThrow(/reserved/);
    expect(db.organization.update).not.toHaveBeenCalled();
  });

  it("reads social handles and websites the way people type them", () => {
    expect(handleOf("@luna")).toBe("luna");
    expect(handleOf("https://instagram.com/luna.vale/")).toBe("luna.vale");
    expect(handleOf("  ")).toBeNull();
    expect(() => handleOf("not a handle!")).toThrow();
    expect(websiteOf("")).toBeNull();
    expect(websiteOf("https://luna.fm/tour")).toBe("https://luna.fm/tour");
    expect(() => websiteOf("localhost")).toThrow();
  });

  it("only takes pictures from our own storage", async () => {
    const { ctx, artists } = setup();
    await expect(
      setProfileImage(ctx, { id: "a1" }, { kind: "avatar", url: "https://evil.example/a.png" }),
    ).rejects.toThrow(/again/);
    await setProfileImage(ctx, { id: "a1" }, { kind: "cover", url: "https://cdn.example/c.png" });
    expect(artists.get("a1")?.coverUrl).toBe("https://cdn.example/c.png");
  });

  it("doesn't redirect to an artist who is no longer approved", async () => {
    const { ctx } = setup({
      artists: [{ id: "a1", slug: "luna-vale-band", status: "BANNED" }],
      history: [{ slug: "luna-vale", organizationId: "a1" }],
    });
    await expect(currentSlugFor(ctx, "luna-vale")).resolves.toBeNull();
    await expect(currentSlugFor(ctx, "never-used")).resolves.toBeNull();
  });
});
