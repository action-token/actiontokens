import { runInNewContext } from "node:vm";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isSharedTheme,
  parentDomain,
  readSharedTheme,
  SHARED_THEME_COOKIE,
  sharedThemeSeedScript,
  writeSharedTheme,
} from "./shared-theme";

/** A tiny cookie jar that honours the `domain` the page asks for, like a browser. */
function fakeBrowser(host: string, protocol = "https:", refuse: string[] = []) {
  const jar = new Map<string, string>();
  const document = {
    get cookie() {
      return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    },
    set cookie(line: string) {
      const [pair, ...attrs] = line.split(";").map((part) => part.trim());
      const [name, value] = pair!.split("=");
      const domain = attrs.find((attr) => attr.startsWith("domain="))?.slice(7);
      if (domain && refuse.includes(domain)) return;
      jar.set(name!, value!);
    },
  };
  vi.stubGlobal("document", document);
  vi.stubGlobal("location", { hostname: host, protocol });
  return { jar, document };
}

afterEach(() => vi.unstubAllGlobals());

describe("the shared theme cookie", () => {
  it("knows the three themes and nothing else", () => {
    expect(["light", "dark", "system"].every(isSharedTheme)).toBe(true);
    expect(isSharedTheme("contrast")).toBe(false);
    expect(isSharedTheme(undefined)).toBe(false);
  });

  it("shares across the parent domain, but not for localhost or an IP", () => {
    expect(parentDomain("app.bandcoin.io")).toBe(".bandcoin.io");
    expect(parentDomain("www.bandcoin.io")).toBe(".bandcoin.io");
    expect(parentDomain("localhost")).toBeNull();
    expect(parentDomain("127.0.0.1")).toBeNull();
    expect(parentDomain("localhost:3000")).toBeNull();
  });

  it("writes and reads a choice", () => {
    const { jar } = fakeBrowser("artist.bandcoin.io");
    expect(readSharedTheme()).toBeNull();
    writeSharedTheme("dark");
    expect(jar.get(SHARED_THEME_COOKIE)).toBe("dark");
    expect(readSharedTheme()).toBe("dark");
  });

  it("ignores a value that isn't a theme", () => {
    const { jar } = fakeBrowser("app.bandcoin.io");
    jar.set(SHARED_THEME_COOKIE, "purple");
    expect(readSharedTheme()).toBeNull();
  });

  it("doesn't rewrite what is already there", () => {
    const { jar } = fakeBrowser("app.bandcoin.io");
    writeSharedTheme("light");
    const set = vi.spyOn(jar, "set");
    writeSharedTheme("light");
    expect(set).not.toHaveBeenCalled();
  });

  it("falls back to this host when the browser refuses the parent domain", () => {
    const { jar } = fakeBrowser("preview.vercel.app", "https:", [".vercel.app"]);
    writeSharedTheme("dark");
    expect(jar.get(SHARED_THEME_COOKIE)).toBe("dark");
  });

  it("works on localhost (no domain)", () => {
    const { jar } = fakeBrowser("localhost", "http:");
    writeSharedTheme("system");
    expect(jar.get(SHARED_THEME_COOKIE)).toBe("system");
  });
});

describe("the seed script", () => {
  const run = (script: string, cookie: string) => {
    const store = new Map<string, string>();
    runInNewContext(script, {
      document: { cookie },
      localStorage: { setItem: (key: string, value: string) => store.set(key, value) },
    });
    return store;
  };

  it("copies the cookie into the app's own key", () => {
    const script = sharedThemeSeedScript("theme");
    expect(run(script, "a=1; bandcoin-theme=dark; b=2").get("theme")).toBe("dark");
  });

  it("renames a value to the app's own word (AR calls system auto)", () => {
    const script = sharedThemeSeedScript("bandcoin-ar-theme", { system: "auto" });
    expect(run(script, "bandcoin-theme=system").get("bandcoin-ar-theme")).toBe("auto");
    expect(run(script, "bandcoin-theme=light").get("bandcoin-ar-theme")).toBe("light");
  });

  it("does nothing for an unknown value or no cookie", () => {
    const script = sharedThemeSeedScript("theme");
    expect(run(script, "bandcoin-theme=contrast").size).toBe(0);
    expect(run(script, "other=1").size).toBe(0);
  });
});
