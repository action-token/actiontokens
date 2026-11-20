import { describe, expect, it } from "vitest";

import { giftEmail } from "../services/email/gift-email";

const base = {
  to: "ana@example.com",
  recipientName: "Ana",
  senderName: "Luna <3",
  title: "Night Drive",
  coverUrl: "https://cdn.example/c.jpg",
  tokenId: "12",
  link: "https://action-tokens.com/item/night-drive",
  newAccount: false,
  locked: { unlocked: 1, total: 2 },
  codes: [{ label: "Backstage", code: "AB12CD" }],
};

describe("gift email", () => {
  it("says who sent which copy, its progress, its door codes and the link", () => {
    const email = giftEmail(base);
    expect(email.to).toBe("ana@example.com");
    expect(email.subject).toBe("Luna <3 sent you Night Drive #12");
    expect(email.text).toContain("1 of 2 locked pieces are unlocked.");
    expect(email.text).toContain("Backstage: AB12CD");
    expect(email.text).toContain("See it: https://action-tokens.com/item/night-drive");
    expect(email.html).toContain("Luna &#60;3");
    expect(email.html).not.toContain("Luna <3");
  });

  it("tells a new account how to get in, and skips what doesn't apply", () => {
    const email = giftEmail({
      ...base,
      newAccount: true,
      locked: { unlocked: 0, total: 0 },
      codes: [],
    });
    expect(email.text).toContain('choose "Forgot password" to set a password');
    expect(email.text).not.toContain("locked pieces");
    expect(email.text).not.toContain("Door codes");
  });
});
