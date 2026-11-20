import { describe, expect, it } from "vitest";

import { assertLegacySource, assertWritable } from "../guard";
import { checkTargets } from "./targets";

const legacy = "postgresql://u:p@legacy.example.com/actionverse";
const local = "postgresql://actiontokens:actiontokens@127.0.0.1:55432/actiontokens_dev";
const remote = "postgresql://u:p@new-db.example.com/actiontokens";

describe("which databases a script may write", () => {
  it("allows a local database", () => {
    expect(() => assertWritable(local, "seed", {})).not.toThrow();
    expect(() => assertWritable("postgresql://u:p@localhost/x", "seed", {})).not.toThrow();
  });

  it("refuses any other host unless the owner listed it", () => {
    expect(() => assertWritable(remote, "seed", {})).toThrow(/ALLOW_DESTRUCTIVE_HOSTS/);
    expect(() =>
      assertWritable(remote, "seed", { ALLOW_DESTRUCTIVE_HOSTS: "new-db.example.com" }),
    ).not.toThrow();
  });

  it("refuses a protected host even when it is allowed", () => {
    expect(() =>
      assertWritable(remote, "seed", {
        ALLOW_DESTRUCTIVE_HOSTS: "new-db.example.com",
        PROTECTED_HOSTS: "New-DB.example.com",
      }),
    ).toThrow(/PROTECTED_HOSTS/);
    expect(() => assertWritable(local, "seed", { PROTECTED_HOSTS: "127.0.0.1" })).toThrow(
      /PROTECTED_HOSTS/,
    );
  });

  it("refuses when nothing is set", () => {
    expect(() => assertWritable(undefined, "seed", {})).toThrow(/not set/);
  });
});

describe("the legacy source", () => {
  it("must be set and must not be the database being written", () => {
    expect(() => assertLegacySource(undefined, local)).toThrow(/LEGACY_DATABASE_URL/);
    expect(() => assertLegacySource(legacy, legacy)).toThrow(/same database/);
    expect(assertLegacySource(legacy, local)).toEqual({
      hostname: "legacy.example.com",
      database: "actionverse",
    });
  });
});

describe("where the copy may read and write", () => {
  it("rehearses on a local database", () => {
    expect(checkTargets({ sourceUrl: legacy, targetUrl: local, cutover: false }, {})).toEqual({
      schema: "public",
      cutover: false,
    });
  });

  it("won't rehearse onto a remote database or onto the legacy one", () => {
    expect(() =>
      checkTargets({ sourceUrl: legacy, targetUrl: remote, cutover: false }, {}),
    ).toThrow(/ALLOW_DESTRUCTIVE_HOSTS/);
    expect(() =>
      checkTargets({ sourceUrl: legacy, targetUrl: legacy, cutover: false }, {}),
    ).toThrow(/same database/);
  });

  it("cuts over only to a listed host, with the host name typed back", () => {
    const input = { sourceUrl: legacy, targetUrl: remote, cutover: true };
    expect(() => checkTargets(input, {})).toThrow(/CUTOVER_ALLOWED_HOSTS/);
    expect(() => checkTargets(input, { CUTOVER_ALLOWED_HOSTS: "new-db.example.com" })).toThrow(
      /CUTOVER_CONFIRM=new-db.example.com/,
    );
    expect(
      checkTargets(input, {
        CUTOVER_ALLOWED_HOSTS: "new-db.example.com",
        CUTOVER_CONFIRM: "new-db.example.com",
      }),
    ).toEqual({ schema: "public", cutover: true });
    expect(() =>
      checkTargets(input, {
        CUTOVER_ALLOWED_HOSTS: "new-db.example.com",
        CUTOVER_CONFIRM: "new-db.example.com",
        PROTECTED_HOSTS: "new-db.example.com",
      }),
    ).toThrow(/PROTECTED_HOSTS/);
  });

  it("needs both urls", () => {
    expect(() =>
      checkTargets({ sourceUrl: undefined, targetUrl: local, cutover: false }, {}),
    ).toThrow(/LEGACY_DATABASE_URL/);
  });
});
