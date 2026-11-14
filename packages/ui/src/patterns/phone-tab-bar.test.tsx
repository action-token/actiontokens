import { Home, Library, Mic2, Store } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PhoneTabBar, type PhoneTab } from "./phone-tab-bar";

const tab = (
  label: string,
  icon: PhoneTab["icon"],
  active = false,
  external = false,
): PhoneTab => ({
  href: external ? "https://artist.example" : `/${label.toLowerCase()}`,
  label,
  icon,
  active,
  external,
});

const bar = (left: PhoneTab[], right: PhoneTab[]) =>
  renderToStaticMarkup(<PhoneTabBar left={left} right={right} arHref="https://ar.example" />);

describe("the phone tab bar", () => {
  it("has two tabs, the raised AR key, two tabs, and hides from sm up", () => {
    const html = bar(
      [tab("Home", Home), tab("Library", Library)],
      [tab("Store", Store), tab("Artist", Mic2, false, true)],
    );
    expect(html).toContain("sm:hidden");
    expect(html).toContain('aria-label="Go to AR"');
    expect(html).toContain('href="https://ar.example"');
    const order = ["Home", "Library", "Go to AR", "Store", "Artist"].map((t) => html.indexOf(t));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((i) => i >= 0)).toBe(true);
  });

  it("lights the active tab and slides the capsule to its slot (the AR key is the third)", () => {
    const left = [tab("Home", Home), tab("Library", Library)];
    const right = [tab("Store", Store), tab("Artist", Mic2, false, true)];
    expect(bar([{ ...left[0]!, active: true }, left[1]!], right)).toContain('data-slot="0"');
    expect(bar([left[0]!, { ...left[1]!, active: true }], right)).toContain('data-slot="1"');
    const onStore = bar(left, [{ ...right[0]!, active: true }, right[1]!]);
    expect(onStore).toContain('data-slot="3"');
    expect(onStore).toContain('aria-current="page"');
  });

  it("has no capsule when nothing is active, and never lights an external tab", () => {
    const left = [tab("Home", Home), tab("Library", Library)];
    const none = bar(left, [tab("Store", Store), tab("Artist", Mic2, true, true)]);
    expect(none).not.toContain("data-slot");
    expect(none).not.toContain("aria-current");
  });
});
