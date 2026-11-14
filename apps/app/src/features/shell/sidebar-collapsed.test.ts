import { describe, expect, it } from "vitest";

import { readCollapsed, readFlag, saveCollapsed, saveFlag } from "@bandcoin/ui/lib/sidebar-collapsed";

const memory = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
};

describe("sidebar fold state", () => {
  it("is open when nothing is saved", () => {
    expect(readCollapsed(memory())).toBe(false);
  });

  it("remembers folding and unfolding", () => {
    const storage = memory();
    saveCollapsed(storage, true);
    expect(readCollapsed(storage)).toBe(true);
    saveCollapsed(storage, false);
    expect(readCollapsed(storage)).toBe(false);
  });

  it("is open when storage is blocked", () => {
    const blocked = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    };
    expect(() => saveCollapsed(blocked, true)).not.toThrow();
    expect(readCollapsed(blocked)).toBe(false);
  });
});

describe("right panel open state", () => {
  const KEY = "bandcoin.right-panel-open";

  it("is closed when nothing is saved, and remembers opening", () => {
    const storage = memory();
    expect(readFlag(storage, KEY)).toBe(false);
    saveFlag(storage, KEY, true);
    expect(readFlag(storage, KEY)).toBe(true);
  });

  it("is kept apart from the left sidebar's fold state", () => {
    const storage = memory();
    saveFlag(storage, KEY, true);
    expect(readCollapsed(storage)).toBe(false);
  });

  it("uses the fallback when nothing is saved", () => {
    expect(readFlag(memory(), KEY, true)).toBe(true);
  });
});
