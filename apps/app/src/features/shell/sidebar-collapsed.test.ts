import { describe, expect, it } from "vitest";

import { readCollapsed, saveCollapsed } from "@bandcoin/ui/lib/sidebar-collapsed";

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
