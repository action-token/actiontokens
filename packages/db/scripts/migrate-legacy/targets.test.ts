import { describe, expect, it } from "vitest";

import { checkTargets } from "./targets";

const backup = "postgresql://u:p@ep-steep-wildflower-a6si6pn6.us-west-2.aws.neon.tech/fan";
const main = "postgresql://u:p@ep-soft-term-a6gzwjv8.us-west-2.aws.neon.tech/fan";
const legacy = "postgresql://u:p@ep-icy-wildflower-a4kxp94q.aws.neon.tech/old-bandcoin";

describe("where the copy may read and write", () => {
  it("rehearses inside the backup database, in its own schema", () => {
    expect(checkTargets({ sourceUrl: backup, targetUrl: backup, cutover: false })).toEqual({
      schema: "rehearsal",
      cutover: false,
    });
  });

  it("writes to the main database only with --cutover", () => {
    expect(checkTargets({ sourceUrl: backup, targetUrl: main, cutover: true })).toEqual({
      schema: "public",
      cutover: true,
    });
    expect(() => checkTargets({ sourceUrl: backup, targetUrl: main, cutover: false })).toThrow(
      /rehearsals stay/,
    );
  });

  it("never reads from the live database", () => {
    expect(() => checkTargets({ sourceUrl: main, targetUrl: backup, cutover: false })).toThrow(
      /only the backup/,
    );
    expect(() => checkTargets({ sourceUrl: main, targetUrl: main, cutover: true })).toThrow(
      /only the backup/,
    );
  });

  it("won't cut over onto the backup or any other database", () => {
    expect(() => checkTargets({ sourceUrl: backup, targetUrl: backup, cutover: true })).toThrow(
      /Refusing --cutover/,
    );
    expect(() => checkTargets({ sourceUrl: backup, targetUrl: legacy, cutover: true })).toThrow(
      /Refusing --cutover/,
    );
    expect(() => checkTargets({ sourceUrl: legacy, targetUrl: backup, cutover: false })).toThrow(
      /only the backup/,
    );
  });

  it("needs both addresses", () => {
    expect(() => checkTargets({ sourceUrl: undefined, targetUrl: backup, cutover: false })).toThrow(
      /Set LEGACY_SOURCE_URL/,
    );
  });
});
