import { describe, expect, it, vi } from "vitest";

import { currencyToml, stellarToml, tomlString } from "../services/platform/toml";

const row = (over: Record<string, unknown> = {}, item: Record<string, unknown> = {}) => ({
  code: "LUNA",
  issuer: "GISSUER",
  item: {
    title: "Luna",
    description: "A song",
    coverUrl: "https://cdn.example/luna.png",
    type: "TRACK",
    artist: { name: "Nova" },
    ...item,
  },
  ...over,
});

const db = (rows: unknown[]) =>
  ({ classicToken: { findMany: vi.fn().mockResolvedValue(rows) } }) as never;

describe("stellar.toml", () => {
  it("escapes what would break the file", () => {
    expect(tomlString('He said "hi"\\ok')).toBe('"He said \\"hi\\"\\\\ok"');
    expect(tomlString("line1\nline2\ttab")).toBe('"line1\\nline2\\ttab"');
    expect(tomlString("bell\u0007")).toBe('"bell\\u0007"');
  });

  it("writes a currency with its image only when it's a web link", () => {
    const text = currencyToml({ code: "A", issuer: "G1", name: "A", image: "https://x/a.png" });
    expect(text).toContain('image="https://x/a.png"');
    expect(currencyToml({ code: "A", issuer: "G1", name: "A", image: "ipfs://x" })).not.toContain(
      "image=",
    );
    expect(currencyToml({ code: "A", issuer: "G1", name: "A" })).not.toContain("desc=");
  });

  it("lists every token once, naming fan tokens after their artist", async () => {
    const toml = await stellarToml(
      db([
        row(),
        row(),
        row(
          { code: "NOVA", issuer: "GFAN" },
          { type: "FAN_TOKEN", title: "NOVA", description: null },
        ),
        row(
          { code: "QUOTE", issuer: "G3" },
          { title: 'The "Best" one', description: 'It says "hi"' },
        ),
      ]),
    );
    expect(toml.startsWith("[DOCUMENTATION]")).toBe(true);
    expect(toml.match(/\[\[CURRENCIES\]\]/g)).toHaveLength(3);
    expect(toml).toContain('name="Nova"');
    expect(toml).toContain('desc="Fan token of Nova"');
    expect(toml).toContain('name="The \\"Best\\" one"');
  });

  it("leaves out deleted and hidden items", async () => {
    const find = vi.fn().mockResolvedValue([]);
    await stellarToml({ classicToken: { findMany: find } } as never);
    expect(find.mock.calls[0]![0].where).toEqual({ item: { deletedAt: null, hiddenAt: null } });
  });
});
