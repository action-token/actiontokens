import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";
import { DEFAULT_THEME } from "@bandcoin/page/theme";

import {
  applyTemplate,
  discardDraft,
  draftDesign,
  getEditor,
  publishPage,
  publishedDesign,
  readDesign,
  saveDraft,
  unpublishPage,
} from "../services/artist/page";

vi.mock("@bandcoin/storage", () => ({
  isOwnS3Url: (url: string) => url.startsWith("https://cdn.example/"),
  uploadBufferToS3: vi.fn(),
}));

type Row = Record<string, unknown>;
const artist = { id: "a1", slug: "luna-vale" };
const cover = {
  uid: "c1",
  type: "cover",
  width: 4,
  hidden: false,
  hideWhenEmpty: false,
  settings: { align: "left" },
};

function setup(layout: Row | null = null) {
  let row: Row | null = layout;
  const db = {
    pageLayout: {
      findFirst: vi.fn(() => Promise.resolve(row)),
      create: vi.fn(({ data }: { data: Row }) => {
        row = {
          id: "l1",
          createdAt: new Date(),
          publishedBlocks: null,
          publishedAt: null,
          ...data,
        };
        return Promise.resolve(row);
      }),
      update: vi.fn(({ data }: { data: Row }) => {
        row = { ...row, ...data };
        return Promise.resolve(row);
      }),
    },
  };
  const activity = { set: vi.fn() };
  return {
    ctx: { db: db as unknown as Db, activity } as never,
    db,
    activity,
    get row() {
      return row;
    },
  };
}

const existing = (over: Row = {}) => ({
  id: "l1",
  artistId: "a1",
  templateKey: "musician",
  status: "DRAFT",
  isActive: false,
  theme: DEFAULT_THEME,
  draftBlocks: [
    cover,
    {
      uid: "a1b",
      type: "about",
      width: 2,
      hidden: false,
      hideWhenEmpty: false,
      settings: { heading: "About", body: "Hi" },
    },
  ],
  publishedBlocks: null,
  publishedAt: null,
  ...over,
});

describe("readDesign", () => {
  it("reads a published page, an old array of blocks, and nonsense", () => {
    expect(
      readDesign({ blocks: [cover], theme: { ...DEFAULT_THEME, accent: "#112233" } }),
    ).toMatchObject({ theme: { accent: "#112233" }, blocks: [{ type: "cover" }] });
    expect(readDesign([cover]).theme).toEqual(DEFAULT_THEME);
    expect(readDesign(null).blocks.map((b) => b.type)).toEqual(["cover"]);
    expect(readDesign({ blocks: [cover], theme: { accent: "red" } }).theme).toEqual(DEFAULT_THEME);
  });
});

describe("getEditor", () => {
  it("makes a starter page from the default template the first time", async () => {
    const test = setup();
    const editor = await getEditor(test.ctx, artist);
    expect(test.db.pageLayout.create).toHaveBeenCalledTimes(1);
    expect(editor).toMatchObject({
      slug: "luna-vale",
      templateKey: "musician",
      isPublished: false,
      hasUnpublishedChanges: true,
    });
    expect(editor.blocks[0]?.type).toBe("cover");
    expect(editor.templates.map((t) => t.key)).toContain("band");
  });

  it("doesn't make a second layout, and says when the draft matches the published page", async () => {
    const draft = existing().draftBlocks;
    const test = setup(
      existing({ status: "PUBLISHED", publishedBlocks: { blocks: draft, theme: DEFAULT_THEME } }),
    );
    expect((await getEditor(test.ctx, artist)).hasUnpublishedChanges).toBe(false);
    expect(test.db.pageLayout.create).not.toHaveBeenCalled();
    const changed = setup(
      existing({ status: "PUBLISHED", publishedBlocks: { blocks: [cover], theme: DEFAULT_THEME } }),
    );
    expect((await getEditor(changed.ctx, artist)).hasUnpublishedChanges).toBe(true);
  });
});

describe("saveDraft", () => {
  it("saves the repaired blocks and the theme, not touching what's published", async () => {
    const test = setup(existing());
    await saveDraft(test.ctx, artist, {
      blocks: [
        { uid: "m", type: "music", width: 9, settings: {} },
        { uid: "x", type: "custom-html" },
      ],
      theme: { ...DEFAULT_THEME, accent: "#112233" },
    });
    const saved = test.db.pageLayout.update.mock.calls[0]?.[0] as {
      data: {
        draftBlocks: { type: string; width: number }[];
        theme: { accent: string };
        publishedBlocks?: unknown;
      };
    };
    expect(saved.data.draftBlocks.map((b) => b.type)).toEqual(["cover", "music"]);
    expect(saved.data.draftBlocks[1]?.width).toBe(2);
    expect(saved.data.theme.accent).toBe("#112233");
    expect(saved.data.publishedBlocks).toBeUndefined();
    expect(test.activity.set).toHaveBeenCalledWith({ targetType: "PageLayout", targetId: "l1" });
  });

  it("refuses a bad theme and band photos that weren't uploaded here", async () => {
    const test = setup(existing());
    await expect(
      saveDraft(test.ctx, artist, { blocks: [cover], theme: { ...DEFAULT_THEME, accent: "red" } }),
    ).rejects.toThrow(/valid accent/);
    const members = {
      uid: "b",
      type: "band-members",
      settings: { members: [{ name: "Ana", photoUrl: "https://evil.example/a.png" }] },
    };
    await expect(
      saveDraft(test.ctx, artist, { blocks: [cover, members], theme: DEFAULT_THEME }),
    ).rejects.toThrow(/Upload the photos again/);
    const ok = {
      ...members,
      settings: { members: [{ name: "Ana", photoUrl: "https://cdn.example/a.png" }] },
    };
    await expect(
      saveDraft(test.ctx, artist, { blocks: [cover, ok], theme: DEFAULT_THEME }),
    ).resolves.toMatchObject({ layoutId: "l1" });
  });
});

describe("publishing", () => {
  it("copies the draft, theme included, to the published page and switches it on", async () => {
    const test = setup(existing({ theme: { ...DEFAULT_THEME, accent: "#112233" } }));
    await publishPage(test.ctx, artist);
    expect(test.row).toMatchObject({
      status: "PUBLISHED",
      isActive: true,
      publishedBlocks: {
        theme: { accent: "#112233" },
        blocks: [{ type: "cover" }, { type: "about" }],
      },
    });
    expect(test.row?.publishedAt).toBeInstanceOf(Date);
  });

  it("takes the page offline but keeps the draft", async () => {
    const test = setup(existing({ status: "PUBLISHED", isActive: true }));
    await unpublishPage(test.ctx, artist);
    expect(test.row).toMatchObject({ status: "DRAFT", isActive: false });
    expect(test.row?.draftBlocks).toBeTruthy();
  });

  it("only shows visitors a published, active page", async () => {
    const test = setup(
      existing({
        status: "PUBLISHED",
        isActive: true,
        publishedBlocks: { blocks: [cover], theme: DEFAULT_THEME },
      }),
    );
    expect(await publishedDesign(test.ctx, "a1")).toMatchObject({ blocks: [{ type: "cover" }] });
    expect(test.db.pageLayout.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { artistId: "a1", isActive: true, status: "PUBLISHED" } }),
    );
    expect(await publishedDesign(setup(null).ctx, "a1")).toBeNull();
  });
});

describe("discard and templates", () => {
  it("goes back to the published page", async () => {
    const test = setup(
      existing({ status: "PUBLISHED", publishedBlocks: { blocks: [cover], theme: DEFAULT_THEME } }),
    );
    await discardDraft(test.ctx, artist);
    expect((test.row?.draftBlocks as unknown[]).length).toBe(1);
  });

  it("goes back to the starter page when nothing was published", async () => {
    const test = setup(existing());
    await discardDraft(test.ctx, artist);
    expect((test.row?.draftBlocks as { type: string }[]).map((b) => b.type)).toEqual([
      "cover",
      "music",
      "releases",
      "tour",
      "membership",
      "links",
    ]);
  });

  it("starts the draft from a template, and refuses an unknown one", async () => {
    const test = setup(
      existing({ status: "PUBLISHED", publishedBlocks: { blocks: [cover], theme: DEFAULT_THEME } }),
    );
    await applyTemplate(test.ctx, artist, "minimal");
    expect(test.row).toMatchObject({ templateKey: "minimal" });
    expect((test.row?.draftBlocks as { type: string }[]).map((b) => b.type)).toEqual([
      "cover",
      "about",
      "links",
    ]);
    expect((test.row?.publishedBlocks as { blocks: unknown[] }).blocks).toHaveLength(1);
    await expect(applyTemplate(test.ctx, artist, "nope")).rejects.toThrow(/Template not found/);
  });

  it("gives the owner their draft for the live preview", async () => {
    const test = setup(existing());
    expect((await draftDesign(test.ctx, "a1")).blocks.map((b) => b.type)).toEqual([
      "cover",
      "about",
    ]);
  });
});
