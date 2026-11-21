import { describe, expect, it, vi } from "vitest";

import { announceBounty, bountyMessage, escapeMarkdown, sendTelegram } from "../send";

const reply = (ok: boolean, body = "") =>
  vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 400,
    text: () => Promise.resolve(body),
  }) as unknown as typeof fetch;

const bounty = {
  id: "b1",
  title: "Win_big (now)",
  summary: "Do it.",
  prizeAmount: "100",
  prizeCode: "ACTION",
  maxWinners: 4,
  by: "Luna",
  requiresActionCam: false,
};

describe("bountyMessage", () => {
  it("escapes our text, splits the prize per winner and links the bounty", () => {
    const text = bountyMessage(bounty, "https://app.test/");
    expect(text).toContain("*Win\\_big \\(now\\)*");
    expect(text).toContain("25 ACTION per winner");
    expect(text).toContain("(https://app.test/bounty/b1)");
    expect(escapeMarkdown("a.b!")).toBe("a\\.b\\!");
  });
});

describe("sendTelegram", () => {
  it("posts to the bot and never leaks the token in an error", async () => {
    const fetcher = reply(true);
    await sendTelegram({ botToken: "SECRET", chatId: "-1" }, "hi", { fetcher });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("botSECRET/sendMessage"),
      expect.anything(),
    );
    await expect(
      sendTelegram({ botToken: "SECRET", chatId: "-1" }, "hi", {
        fetcher: reply(false, "chat not found"),
      }),
    ).rejects.toThrow(expect.objectContaining({ message: expect.not.stringContaining("SECRET") }));
  });
});

describe("announceBounty", () => {
  const db = (config: object | null, found: object | null) => ({
    telegramConfig: { findFirst: vi.fn().mockResolvedValue(config) },
    bounty: { findUnique: vi.fn().mockResolvedValue(found) },
  });
  const row = {
    id: "b1",
    title: "T",
    summary: "S",
    prizeAmount: { toString: () => "10" },
    prizeCurrency: "XLM",
    prizeAssetCode: null,
    maxWinners: 1,
    requiresActionCam: false,
    hiddenAt: null,
    organization: { name: "Luna" },
  };

  it("does nothing while Telegram is off", async () => {
    const fetcher = reply(true);
    const result = await announceBounty(
      { db: db({ enabled: false, botToken: "t", chatId: "c" }, row) } as never,
      "b1",
      { fetcher },
    );
    expect(result.sent).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("announces a public bounty and skips a hidden one", async () => {
    const on = { enabled: true, botToken: "t", chatId: "c" };
    const fetcher = reply(true);
    expect((await announceBounty({ db: db(on, row) } as never, "b1", { fetcher })).sent).toBe(true);
    expect(
      (
        await announceBounty({ db: db(on, { ...row, hiddenAt: new Date() }) } as never, "b1", {
          fetcher,
        })
      ).sent,
    ).toBe(false);
  });
});
