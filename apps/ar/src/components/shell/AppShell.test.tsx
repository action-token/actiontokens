import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./StatusBar", () => ({ StatusBar: () => null }));
vi.mock("./NotificationsButton", () => ({ NotificationsButton: () => null }));
vi.mock("./ProfileButton", () => ({ ProfileButton: () => null }));
vi.mock("~/lib/navigation", () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }));

import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("lets content run under the tab bar: no fixed bottom padding, just the ar-tabbed space", () => {
    const html = renderToStaticMarkup(<AppShell>x</AppShell>);
    expect(html).toContain("ar-tabbed");
    expect(html).not.toContain("pb-[80px]");
    // the dock itself is mounted once in AppFrame, never per screen
    expect(html).not.toContain("<nav");
  });

  it("without tabs has no tab-bar space", () => {
    const html = renderToStaticMarkup(<AppShell tabs={false}>x</AppShell>);
    expect(html).not.toContain("ar-tabbed");
  });
});
