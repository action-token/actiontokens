import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { liveTicket } from "@bandcoin/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

import { attachLiveRelay } from "./live-relay";

let server: Server;
let relay: ReturnType<typeof attachLiveRelay>;
const lyria = {
  setWeightedPrompts: vi.fn().mockResolvedValue(undefined),
  setMusicGenerationConfig: vi.fn().mockResolvedValue(undefined),
  play: vi.fn(),
  pause: vi.fn(),
  stop: vi.fn(),
  close: vi.fn(),
};

beforeEach(async () => {
  vi.stubEnv("NEXTAUTH_SECRET", "test-secret");
  Object.values(lyria).forEach((fn) => fn.mockClear());
  server = createServer((_, response) => response.writeHead(404).end());
  const db = { appSetting: { findUnique: vi.fn().mockResolvedValue(null) } };
  relay = attachLiveRelay(server, {
    ctx: { db } as never,
    connect: () => Promise.resolve(lyria),
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
});

afterEach(async () => {
  await relay.close();
  server.close();
  vi.unstubAllEnvs();
});

const address = () => `ws://127.0.0.1:${(server.address() as AddressInfo).port}/live`;

describe("the live music relay", () => {
  it("turns away a connection without a good ticket", async () => {
    for (const query of ["", "?ticket=forged.abc"]) {
      const socket = new WebSocket(`${address()}${query}`);
      const error = await new Promise<Error>((resolve) => socket.on("error", resolve));
      expect(error.message).toMatch(/401/);
    }
  });

  it("opens a session for a signed ticket and passes the browser's settings on", async () => {
    const socket = new WebSocket(`${address()}?ticket=${liveTicket("u1")}`);
    const first = await new Promise<string>((resolve) =>
      socket.once("message", (m) => resolve(Buffer.from(m as Buffer).toString())),
    );
    expect(JSON.parse(first)).toMatchObject({ type: "ready" });
    socket.send(JSON.stringify({ type: "prompts", prompts: [{ text: "jazz", weight: 1 }] }));
    await vi.waitFor(() =>
      expect(lyria.setWeightedPrompts).toHaveBeenCalledWith({
        weightedPrompts: [{ text: "jazz", weight: 1 }],
      }),
    );
    socket.send("not json");
    socket.close();
    await vi.waitFor(() => expect(lyria.close).toHaveBeenCalled());
  });
});
