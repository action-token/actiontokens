import { describe, expect, it, vi } from "vitest";

import type { SessionUser } from "../context";
import { studioDraft } from "../services/artist/studio-import";

vi.mock("@bandcoin/storage", () => ({
  isOwnS3Url: (url: string) => url.startsWith("https://bucket/"),
}));

const user: SessionUser = { id: "u1", role: "FAN", walletAddress: "G1", walletType: "email" };
const publish = {
  audio: { url: "https://bucket/mix.wav", durationSec: 62 },
  stems: [{ name: "Beat", url: "https://bucket/beat.wav", durationSec: 62 }],
};

const ctxWith = (project: unknown) =>
  ({ db: { stemProject: { findFirst: vi.fn().mockResolvedValue(project) } } }) as never;

describe("starting a song from Studio", () => {
  it("brings the project's name, mix and stems", async () => {
    const ctx = ctxWith({ id: "p1", name: "Night drive mix", data: { tracks: [], publish } });
    expect(await studioDraft(ctx, user, "p1")).toEqual({
      projectId: "p1",
      title: "Night drive mix",
      audio: publish.audio,
      stems: publish.stems,
    });
  });

  it("needs your own project, published first, with files in storage", async () => {
    await expect(studioDraft(ctxWith(null), user, "p1")).rejects.toThrow(/isn't yours/);
    await expect(
      studioDraft(ctxWith({ id: "p1", name: "Mix", data: { tracks: [] } }), user, "p1"),
    ).rejects.toThrow(/Publish as a song/);
    const elsewhere = { ...publish, audio: { url: "https://other/mix.wav", durationSec: 62 } };
    await expect(
      studioDraft(
        ctxWith({ id: "p1", name: "Mix", data: { tracks: [], publish: elsewhere } }),
        user,
        "p1",
      ),
    ).rejects.toThrow(/Publish again/);
  });
});
