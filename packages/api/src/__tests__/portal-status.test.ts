import { describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import { createContext, type SessionUser } from "../context";
import { portalRouter } from "../root-portal";
import type { ChainGateway } from "../services/chain-gateway";
import { createCallerFactory } from "../trpc";

const fan: SessionUser = { id: "u1", role: "FAN", walletAddress: "GFAN", walletType: "freighter" };
const admin: SessionUser = { ...fan, id: "u2", role: "ADMIN" };

function setup(user: SessionUser | null, artist: Record<string, unknown> | null = null) {
  const db = {
    organization: { findUnique: vi.fn().mockResolvedValue(artist) },
    activityLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const caller = createCallerFactory(portalRouter)(
    createContext({
      db: db as unknown as Db,
      chain: {} as ChainGateway,
      app: "org",
      session: user ? { user } : null,
    }),
  );
  return { caller, db };
}

describe("portal.status", () => {
  it("is empty when signed out, so the app can show its sign-in", async () => {
    await expect(setup(null).caller.portal.status()).resolves.toEqual({ signedIn: false });
  });

  it("tells a fan with no application to apply", async () => {
    await expect(setup(fan).caller.portal.status()).resolves.toEqual({
      signedIn: true,
      isAdmin: false,
      artist: null,
    });
  });

  it("shows where an applicant is: waiting for the issuer payment, or for approval", async () => {
    const pending = {
      id: "a1",
      name: "Luna Vale",
      slug: "luna-vale",
      status: "PENDING",
      issuerAccountId: null,
    };
    await expect(setup(fan, pending).caller.portal.status()).resolves.toMatchObject({
      artist: { name: "Luna Vale", status: "PENDING", step: "OPEN_ISSUER" },
    });
    await expect(
      setup(fan, { ...pending, issuerAccountId: "chain1" }).caller.portal.status(),
    ).resolves.toMatchObject({
      artist: { status: "PENDING", step: "WAITING_FOR_APPROVAL" },
    });
  });

  it("tells a rejected applicant why, so they can fix it and apply again", async () => {
    const rejected = {
      id: "a1",
      name: "Luna Vale",
      slug: "luna-vale",
      status: "REJECTED",
      issuerAccountId: null,
      rejectionReason: "Use your real artist name",
    };
    await expect(setup(fan, rejected).caller.portal.status()).resolves.toMatchObject({
      artist: {
        status: "REJECTED",
        step: "REJECTED",
        rejectionReason: "Use your real artist name",
      },
    });
  });

  it("marks approved and banned artists, and admins", async () => {
    const approved = {
      id: "a1",
      name: "Luna Vale",
      slug: "luna-vale",
      status: "APPROVED",
      issuerAccountId: "chain1",
    };
    await expect(setup(fan, approved).caller.portal.status()).resolves.toMatchObject({
      artist: { status: "APPROVED", step: "READY" },
    });
    await expect(
      setup(fan, { ...approved, status: "BANNED" }).caller.portal.status(),
    ).resolves.toMatchObject({ artist: { status: "BANNED", step: "BANNED" } });
    await expect(setup(admin).caller.portal.status()).resolves.toMatchObject({ isAdmin: true });
  });
});
