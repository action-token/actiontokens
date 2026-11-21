import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarketCard, type MarketItem } from "./MarketCard";

const item: MarketItem = {
  slug: "moon-song",
  title: "Moon song",
  type: "TRACK",
  coverUrl: "https://img/x.png",
  artistName: "Lila",
  price: { actionToken: "1250", usd: "5" },
};

describe("MarketCard", () => {
  it("shows the price, artist and both links", () => {
    const html = renderToStaticMarkup(<MarketCard item={item} />);
    expect(html).toContain("1,250");
    expect(html).toContain("≈ $5");
    expect(html).toContain("Lila");
    expect(html).toContain('href="/marketplace/moon-song"');
    expect(html).toContain("/item/moon-song");
    expect(html).toContain("Go to Marketplace");
    expect(html).not.toContain("Sold out");
  });
  it("says sold out when nothing is open", () => {
    const html = renderToStaticMarkup(<MarketCard item={{ ...item, price: null }} />);
    expect(html).toContain("Sold out");
  });
});
