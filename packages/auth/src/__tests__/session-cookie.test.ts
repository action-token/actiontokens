import { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const SESSION = "__Secure-next-auth.session-token";

/** The module reads AUTH_COOKIE_DOMAIN once at import, so each case loads a fresh copy. */
async function load(domain?: string) {
  vi.resetModules();
  vi.unstubAllEnvs();
  if (domain) vi.stubEnv("AUTH_COOKIE_DOMAIN", domain);
  return import("../session-cookie");
}

function request(cookie?: string) {
  return new NextRequest(
    "https://app.action-tokens.com/",
    cookie ? { headers: { cookie } } : undefined,
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sharedSessionCookie", () => {
  it("leaves NextAuth's defaults alone when no domain is set", async () => {
    const { sharedSessionCookie } = await load();
    expect(sharedSessionCookie).toBeUndefined();
  });

  it("writes the session cookie for the whole domain, keeping the default name", async () => {
    const { sharedSessionCookie } = await load(".action-tokens.com");
    expect(sharedSessionCookie?.sessionToken.name).toBe(SESSION);
    expect(sharedSessionCookie?.sessionToken.options).toMatchObject({
      domain: ".action-tokens.com",
      secure: true,
      httpOnly: true,
    });
  });
});

describe("local development", () => {
  it("names the cookie for Action Tokens, so other apps on localhost can't overwrite or reject it", async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "development");
    const { sharedSessionCookie } = await import("../session-cookie");
    expect(sharedSessionCookie?.sessionToken.name).toBe("action-tokens.session-token");
    expect(sharedSessionCookie?.sessionToken.options).toMatchObject({
      httpOnly: true,
      secure: false,
      path: "/",
    });
    expect(sharedSessionCookie?.sessionToken.options).not.toHaveProperty("domain");
  });
});

describe("clearLegacySessionCookie", () => {
  it("expires the host-only copy (no Domain) when the request carries a session", async () => {
    const { clearLegacySessionCookie } = await load(".action-tokens.com");
    const res = NextResponse.next();
    clearLegacySessionCookie(request(`${SESSION}=abc; other=1`), res);
    const cleared = res.headers.get("set-cookie") ?? "";
    expect(cleared).toContain(`${SESSION}=; Path=/; Max-Age=0`);
    expect(cleared).not.toMatch(/domain=/i);
  });

  it("also expires chunked session cookies", async () => {
    const { clearLegacySessionCookie } = await load(".action-tokens.com");
    const res = NextResponse.next();
    clearLegacySessionCookie(request(`${SESSION}.0=a; ${SESSION}.1=b`), res);
    const cleared = res.headers.get("set-cookie") ?? "";
    expect(cleared).toContain(`${SESSION}.0=;`);
    expect(cleared).toContain(`${SESSION}.1=;`);
  });

  it("does nothing without a session cookie or without a shared domain", async () => {
    const shared = await load(".action-tokens.com");
    const res = NextResponse.next();
    shared.clearLegacySessionCookie(request("other=1"), res);
    expect(res.headers.get("set-cookie")).toBeNull();

    const local = await load();
    const res2 = NextResponse.next();
    local.clearLegacySessionCookie(request(`${SESSION}=abc`), res2);
    expect(res2.headers.get("set-cookie")).toBeNull();
  });
});
