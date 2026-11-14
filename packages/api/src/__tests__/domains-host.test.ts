import { describe, expect, it, vi } from "vitest";

import { domainHostFromEnv, manualHost } from "../services/domains/adapter";
import { DomainHostError } from "../services/domains/host";
import { vercelHost } from "../services/domains/vercel";

/** A fake Vercel: answers by "METHOD path", records every call. */
function fakeVercel(answers: Record<string, { status?: number; body: unknown }>) {
  const calls: { method: string; url: string; body: unknown }[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    calls.push({
      method: init.method!,
      url,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    const key = `${init.method} ${path}`;
    const answer =
      answers[key] ??
      Object.entries(answers).find(([k]) => key.startsWith(k.replace(/\*$/, "")))?.[1];
    if (!answer)
      return new Response(JSON.stringify({ error: { message: "not found" } }), { status: 404 });
    return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200 });
  });
  const host = vercelHost({
    token: "t",
    projectId: "fan-app",
    teamId: "team_1",
    fetch: fetch as never,
  });
  return { host, calls };
}

const P = "/v10/projects/fan-app/domains";
const D = (domain: string) => `/v9/projects/fan-app/domains/${domain}`;

describe("Vercel host", () => {
  it("adds a root domain with www redirecting to it", async () => {
    const { host, calls } = fakeVercel({
      [`POST ${P}`]: { body: { name: "coldplay.com", apexName: "coldplay.com", verified: false } },
    });
    expect(await host.add("coldplay.com")).toEqual({ withWww: true });
    expect(calls.map((call) => call.body)).toEqual([
      { name: "coldplay.com" },
      { name: "www.coldplay.com", redirect: "coldplay.com", redirectStatusCode: 308 },
    ]);
    expect(calls[0]!.url).toContain("teamId=team_1");
  });

  it("adds a subdomain on its own", async () => {
    const { host, calls } = fakeVercel({
      [`POST ${P}`]: {
        body: { name: "music.coldplay.com", apexName: "coldplay.com", verified: true },
      },
    });
    expect(await host.add("music.coldplay.com")).toEqual({ withWww: false });
    expect(calls).toHaveLength(1);
  });

  it("takes the root off again when its www can't be added", async () => {
    let posts = 0;
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === "POST" && ++posts === 2)
        return new Response(JSON.stringify({ error: { message: "www is taken" } }), {
          status: 409,
        });
      return new Response(
        JSON.stringify({ name: "coldplay.com", apexName: "coldplay.com", verified: false }),
      );
    });
    const host = vercelHost({ token: "t", projectId: "fan-app", fetch: fetch as never });
    await expect(host.add("coldplay.com")).rejects.toThrow("www is taken");
    expect(fetch.mock.calls.at(-1)![1].method).toBe("DELETE");
  });

  it("passes on Vercel's own message when it refuses", async () => {
    const { host } = fakeVercel({
      [`POST ${P}`]: {
        status: 409,
        body: { error: { message: "The domain is already assigned to another Vercel project" } },
      },
    });
    await expect(host.add("coldplay.com")).rejects.toEqual(
      new DomainHostError("The domain is already assigned to another Vercel project", 409),
    );
  });

  it("shows the ownership and pointing records Vercel asks for", async () => {
    const { host } = fakeVercel({
      [`GET ${D("coldplay.com")}`]: {
        body: {
          name: "coldplay.com",
          apexName: "coldplay.com",
          verified: false,
          verification: [
            {
              type: "TXT",
              domain: "_vercel.coldplay.com",
              value: "vc-domain-verify=abc",
              reason: "pending",
            },
          ],
        },
      },
      [`POST ${D("coldplay.com")}/verify`]: {
        status: 400,
        body: {
          error: {
            message:
              "The domain does not have a TXT record that attempts to verify the project domain",
          },
        },
      },
      ["GET /v6/domains/coldplay.com/config"]: {
        body: {
          misconfigured: true,
          recommendedIPv4: [
            { rank: 2, value: ["9.9.9.9"] },
            { rank: 1, value: ["76.76.21.21"] },
          ],
          recommendedCNAME: [{ rank: 1, value: "abc.vercel-dns-017.com." }],
        },
      },
    });
    const status = await host.status("coldplay.com", { withWww: true });
    expect(status).toMatchObject({ found: true, verified: false, configured: false });
    expect(status.error).toContain("TXT record");
    expect(status.records).toEqual([
      {
        type: "TXT",
        name: "_vercel.coldplay.com",
        value: "vc-domain-verify=abc",
        purpose: "ownership",
      },
      { type: "A", name: "coldplay.com", value: "76.76.21.21", purpose: "point" },
      {
        type: "CNAME",
        name: "www.coldplay.com",
        value: "abc.vercel-dns-017.com",
        purpose: "point",
      },
    ]);
  });

  it("is live once verified and configured", async () => {
    const { host } = fakeVercel({
      [`GET ${D("music.coldplay.com")}`]: {
        body: { name: "music.coldplay.com", apexName: "coldplay.com", verified: true },
      },
      ["GET /v6/domains/music.coldplay.com/config"]: {
        body: {
          misconfigured: false,
          recommendedIPv4: [],
          recommendedCNAME: [{ rank: 1, value: "cname.vercel-dns.com" }],
        },
      },
    });
    const status = await host.status("music.coldplay.com", { withWww: false });
    expect(status).toMatchObject({ found: true, verified: true, configured: true, error: null });
    expect(status.records).toEqual([
      {
        type: "CNAME",
        name: "music.coldplay.com",
        value: "cname.vercel-dns.com",
        purpose: "point",
      },
    ]);
  });

  it("says when the domain isn't on the host any more", async () => {
    const { host } = fakeVercel({});
    expect(await host.status("gone.com", { withWww: false })).toMatchObject({ found: false });
  });

  it("removing a domain Vercel doesn't have is fine", async () => {
    const { host, calls } = fakeVercel({});
    await expect(host.remove("gone.com")).resolves.toBeUndefined();
    expect(calls[0]).toMatchObject({ method: "DELETE", body: { removeRedirects: true } });
  });
});

describe("choosing the host", () => {
  it("uses Vercel only when it's fully set up", () => {
    expect(
      domainHostFromEnv({ DOMAIN_HOST: "vercel", VERCEL_TOKEN: "t", VERCEL_PROJECT_ID: "p" }).name,
    ).toBe("vercel");
    expect(domainHostFromEnv({ DOMAIN_HOST: "vercel", VERCEL_TOKEN: "t" })).toBe(manualHost);
    expect(domainHostFromEnv({})).toBe(manualHost);
  });

  it("the manual host says custom domains aren't open", async () => {
    expect(manualHost.available).toBe(false);
    await expect(manualHost.add("coldplay.com")).rejects.toThrow("Custom domains aren't open yet.");
  });
});
