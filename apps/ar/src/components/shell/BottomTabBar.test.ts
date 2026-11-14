import { describe, expect, it, vi } from "vitest";

vi.mock("~/components/camera/CameraLauncher", () => ({ CameraLauncher: () => null }));
vi.mock("~/components/murals/PackRing", () => ({ PackRing: () => null }));
vi.mock("~/lib/navigation", () => ({ useRouter: () => ({ pathname: "/" }) }));

import { LEFT, RIGHT } from "./BottomTabBar";

describe("the AR tab bar", () => {
  it("has Marketplace in place of Bounty, two tabs each side", () => {
    expect(LEFT.map((t) => t.href)).toEqual(["/map", "/collection"]);
    expect(RIGHT.map((t) => t.href)).toEqual(["/marketplace", "/artists"]);
  });
});
