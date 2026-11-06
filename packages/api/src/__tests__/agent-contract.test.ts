import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { UNLIMITED_COLLECTIONS } from "../services/agent/contract";

/**
 * The artist portal's chat screen imports the agent's shared types (and one constant) from
 * "@bandcoin/api/agent-contract" in browser code. That file must stay free of imports, or the
 * browser would pull server code through it.
 */
describe("the agent contract entry point", () => {
  const file = resolve(__dirname, "../services/agent/contract.ts");

  it("has no imports", () => {
    const imports = readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => /^\s*import\s/.test(line));
    expect(imports).toEqual([]);
  });

  it("is exposed by the package under its own name", () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf8")) as {
      exports: Record<string, string>;
    };
    expect(pkg.exports["./agent-contract"]).toBe("./src/services/agent/contract.ts");
  });

  it("keeps the unlimited collection limit the pin tools store", () => {
    expect(UNLIMITED_COLLECTIONS).toBe(999_999);
  });
});
