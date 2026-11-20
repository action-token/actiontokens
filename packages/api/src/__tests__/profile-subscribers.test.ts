import { describe, expect, it, vi } from "vitest";

import { getProfile } from "../services/artist/profile";

describe("the artist's profile counts", () => {
  it("counts subscribers (followers who trust the fan token) apart from followers", async () => {
    const db = {
      organization: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "a1",
          name: "Nova",
          fanTokenItem: null,
          _count: { followers: 9, pins: 1, posts: 2, bounties: 0, items: 3 },
        }),
      },
      follow: { count: vi.fn().mockResolvedValue(4) },
    };
    const profile = await getProfile({ db } as never, { id: "a1" });
    expect(profile.counts).toMatchObject({ followers: 9, subscribers: 4 });
    expect(db.follow.count).toHaveBeenCalledWith({
      where: { organizationId: "a1", isTemporary: false },
    });
  });
});
