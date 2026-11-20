import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";

import { AppError, ErrorCodes } from "@actiontokens/errors";

import type { SessionUser } from "../context";
import { createMcpServer, type AgentCaller } from "../services/agent/mcp";
import { handleMcpPost } from "../services/agent/mcp-http";
import {
  bearerMcpToken,
  createMcpToken,
  hashMcpToken,
  listMcpTokens,
  MAX_ACTIVE_TOKENS,
  mcpUser,
  revokeMcpToken,
} from "../services/agent/mcp-token";

vi.mock("@actiontokens/wallet/server", () => ({}));

const user: SessionUser = { id: "u1", role: "ARTIST", walletAddress: "GABC", walletType: "email" };

function tokenDb(over: { row?: Record<string, unknown> | null; active?: number } = {}) {
  const row =
    over.row === null
      ? null
      : {
          id: "t1",
          walletType: "email",
          revokedAt: null,
          lastUsedAt: null,
          user: { id: "u1", role: "ARTIST", walletAddress: "GABC", suspendedAt: null },
          ...over.row,
        };
  return {
    mcpToken: {
      findUnique: vi.fn().mockResolvedValue(row),
      update: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(over.active ?? 0),
      create: vi.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: "t9", createdAt: new Date(), lastUsedAt: null, ...args.data }),
      ),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

describe("MCP tokens", () => {
  it("makes a token shown once, and stores only its hash", async () => {
    const db = tokenDb();
    const made = await createMcpToken(db as never, user, " Claude Desktop ");
    expect(made.token).toMatch(/^bc_mcp_[A-Za-z0-9_-]{40,}$/);
    const stored = db.mcpToken.create.mock.calls[0]![0].data as Record<string, unknown>;
    expect(stored.tokenHash).toBe(hashMcpToken(made.token));
    expect(JSON.stringify(stored)).not.toContain(made.token);
    expect(stored).toMatchObject({ name: "Claude Desktop", prefix: made.token.slice(0, 13) });
    expect(made.prefix).toHaveLength(13);
  });

  it("limits how many tokens are active, and the name", async () => {
    await expect(
      createMcpToken(tokenDb({ active: MAX_ACTIVE_TOKENS }) as never, user, "x"),
    ).rejects.toThrow(/up to 10/);
    await expect(createMcpToken(tokenDb() as never, user, "  ")).rejects.toThrow(/Name the token/);
  });

  it("finds the person behind a token, and writes 'last used' only now and then", async () => {
    const db = tokenDb();
    const now = new Date("2026-11-05T10:00:00Z");
    expect(await mcpUser(db as never, "bc_mcp_x", now)).toEqual(user);
    expect(db.mcpToken.update).toHaveBeenCalledTimes(1);
    const recent = tokenDb({ row: { lastUsedAt: new Date(now.getTime() - 60_000) } });
    await mcpUser(recent as never, "bc_mcp_x", now);
    expect(recent.mcpToken.update).not.toHaveBeenCalled();
  });

  it("refuses unknown, revoked and suspended tokens, and a person with no wallet", async () => {
    expect(await mcpUser(tokenDb({ row: null }) as never, "t")).toBeNull();
    expect(await mcpUser(tokenDb({ row: { revokedAt: new Date() } }) as never, "t")).toBeNull();
    const suspended = tokenDb({
      row: { user: { id: "u1", role: "ARTIST", walletAddress: "G", suspendedAt: new Date() } },
    });
    expect(await mcpUser(suspended as never, "t")).toBeNull();
    const noWallet = tokenDb({
      row: { user: { id: "u1", role: "ARTIST", walletAddress: null, suspendedAt: null } },
    });
    expect(await mcpUser(noWallet as never, "t")).toBeNull();
  });

  it("reads a bearer header only when it's one of ours", () => {
    expect(bearerMcpToken("Bearer bc_mcp_abc")).toBe("bc_mcp_abc");
    expect(bearerMcpToken("bearer bc_mcp_abc")).toBe("bc_mcp_abc");
    expect(bearerMcpToken("Bearer other_abc")).toBeNull();
    expect(bearerMcpToken("Basic bc_mcp_abc")).toBeNull();
    expect(bearerMcpToken(null)).toBeNull();
  });

  it("lists and revokes your own tokens only", async () => {
    const db = tokenDb();
    await listMcpTokens(db as never, user);
    expect(db.mcpToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", revokedAt: null } }),
    );
    await revokeMcpToken(db as never, user, "t1");
    expect(db.mcpToken.updateMany).toHaveBeenCalledWith({
      where: { id: "t1", userId: "u1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    db.mcpToken.updateMany.mockResolvedValue({ count: 0 });
    await expect(revokeMcpToken(db as never, user, "nope")).rejects.toThrow(/not found/);
  });
});

const message = {
  id: "m1",
  role: "assistant" as const,
  text: "Found 2 parks.",
  createdAt: new Date(),
  steps: [],
  blocks: [
    {
      kind: "proposal" as const,
      id: "act1",
      actionId: "act1",
      summary: "Create 2 pins",
      action: { type: "hide_pins" as const, pins: [{ id: "p1", title: "Park" }] },
    },
  ],
};

function fakeAgent(over: Record<string, unknown> = {}) {
  const agent = {
    overview: vi
      .fn()
      .mockResolvedValue({ artist: { id: "a1", name: "Nova" }, suggestions: ["Find parks"] }),
    send: vi.fn().mockResolvedValue({ conversationId: "c1", jobId: "j1", userMessage: {} }),
    poll: vi.fn().mockResolvedValue({ status: "SUCCEEDED", steps: [], message }),
    conversation: vi.fn().mockResolvedValue({
      id: "c1",
      title: "Parks",
      messages: [message],
      actions: { act1: { status: "pending", result: null } },
    }),
    conversations: vi
      .fn()
      .mockResolvedValue([
        { id: "c1", title: "Parks", updatedAt: new Date("2026-11-05T10:00:00Z") },
      ]),
    deleteConversation: vi.fn().mockResolvedValue({ id: "c1" }),
    confirm: vi
      .fn()
      .mockResolvedValue({ status: "done", message: "Creating 2 pins…", pinJobId: "b1" }),
    cancel: vi.fn().mockResolvedValue({ status: "cancelled" }),
    pinJob: vi.fn().mockResolvedValue({
      status: "RUNNING",
      total: 2,
      completed: 1,
      failed: ["Bad"],
      error: null,
    }),
    ...over,
  };
  return agent;
}

async function connect(agent: ReturnType<typeof fakeAgent>) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createMcpServer(agent as unknown as AgentCaller, "u1", { ms: 50, every: 5 }).connect(
    serverSide,
  );
  const client = new Client({ name: "test", version: "1" });
  await client.connect(clientSide);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = (await client.callTool({ name, arguments: args })) as {
      isError?: boolean;
      content: { type: string; text: string }[];
    };
    return { error: Boolean(result.isError), text: result.content[0]!.text };
  };
  return { client, call };
}

describe("the MCP server", () => {
  it("lists the tools an AI app can use", async () => {
    const { client } = await connect(fakeAgent());
    const names = (await client.listTools()).tools.map((tool) => tool.name).sort();
    expect(names).toEqual([
      "ask_agent",
      "cancel_proposal",
      "confirm_proposal",
      "delete_conversation",
      "get_artist",
      "get_conversation",
      "get_pin_job",
      "get_reply",
      "list_conversations",
    ]);
  });

  it("sends a message and returns the reply with the proposal's id and what confirming does", async () => {
    const agent = fakeAgent();
    const { call } = await connect(agent);
    const out = await call("ask_agent", { text: "Find parks in Austin" });
    expect(agent.send).toHaveBeenCalledWith({ text: "Find parks in Austin" });
    expect(out.text).toContain("Conversation `c1`");
    expect(out.text).toContain("Found 2 parks.");
    expect(out.text).toContain("Proposal `act1`");
    expect(out.text).toContain("Nothing changes until it's confirmed");
    expect(out.text).toContain("Hide 1 pins: Park");
  });

  it("says when the agent is still working, with a job to wait on", async () => {
    const agent = fakeAgent({
      poll: vi.fn().mockResolvedValue({
        status: "RUNNING",
        steps: [{ id: "s", label: "Searching parks", status: "running" }],
        message: null,
      }),
    });
    const { call } = await connect(agent);
    const out = await call("ask_agent", { text: "Find parks" });
    expect(out.text).toMatch(/still working \(job `j1`\)/);
    expect(out.text).toContain("Searching parks [running]");
  });

  it("returns a failed run and an API refusal as an error the AI can read", async () => {
    const failed = fakeAgent({
      poll: vi.fn().mockResolvedValue({
        status: "FAILED",
        steps: [],
        error: "The assistant couldn't finish.",
        message: null,
      }),
    });
    expect(await (await connect(failed)).call("ask_agent", { text: "hi" })).toEqual({
      error: true,
      text: "The assistant couldn't finish.",
    });
    const limited = fakeAgent({
      send: vi.fn().mockRejectedValue(
        new AppError(ErrorCodes.RATE_LIMITED, {
          message: "You've used today's 50 AI generations.",
        }),
      ),
    });
    expect(await (await connect(limited)).call("ask_agent", { text: "hi" })).toEqual({
      error: true,
      text: "You've used today's 50 AI generations.",
    });
  });

  it("confirms with the person's edits, and points to the pin job", async () => {
    const agent = fakeAgent();
    const { call } = await connect(agent);
    const out = await call("confirm_proposal", {
      actionId: "act1",
      keep: ["g1"],
      defaults: { pinNumber: 3 },
    });
    expect(agent.confirm).toHaveBeenCalledWith({
      actionId: "act1",
      edits: { keep: ["g1"], defaults: { pinNumber: 3 }, draft: undefined },
    });
    expect(out.text).toContain("Creating 2 pins…");
    expect(out.text).toContain("get_pin_job (jobId `b1`)");
  });

  it("rejects edits that don't fit before anything runs", async () => {
    const agent = fakeAgent();
    const { client } = await connect(agent);
    const result = await client.callTool({
      name: "confirm_proposal",
      arguments: { actionId: "a", defaults: { pinNumber: 9999 } },
    });
    expect(result.isError).toBe(true);
    expect(agent.confirm).not.toHaveBeenCalled();
  });

  it("covers the rest: overview, conversations, cancel and pin progress", async () => {
    const { call } = await connect(fakeAgent());
    expect((await call("get_artist")).text).toContain("Artist: Nova");
    expect((await call("list_conversations")).text).toContain("`c1` Parks");
    expect((await call("get_conversation", { conversationId: "c1" })).text).toContain("## Parks");
    expect((await call("delete_conversation", { conversationId: "c1" })).text).toBe(
      "Conversation deleted.",
    );
    expect((await call("cancel_proposal", { actionId: "act1" })).text).toBe("Proposal cancelled.");
    const job = await call("get_pin_job", { jobId: "b1" });
    expect(job.text).toContain("1/2 done");
    expect(job.text).toContain("Failed: Bad");
  });
});

describe("the MCP address", () => {
  it("turns away a request without one of our tokens, and one with a revoked token", async () => {
    const db = tokenDb({ row: { revokedAt: new Date() } });
    const deps = { db: db as never, callerFor: vi.fn() };
    const noToken = await handleMcpPost(
      new Request("https://x/api/mcp", { method: "POST", body: "{}" }),
      deps,
    );
    expect(noToken.status).toBe(401);
    expect(noToken.headers.get("www-authenticate")).toContain("Bearer");
    const revoked = await handleMcpPost(
      new Request("https://x/api/mcp", {
        method: "POST",
        headers: { authorization: "Bearer bc_mcp_abc" },
        body: "{}",
      }),
      deps,
    );
    expect(revoked.status).toBe(401);
    expect(deps.callerFor).not.toHaveBeenCalled();
  });

  it("answers a real MCP request for a good token, acting as that person", async () => {
    const agent = fakeAgent();
    const db = tokenDb();
    const callerFor = vi.fn().mockReturnValue(agent);
    const response = await handleMcpPost(
      new Request("https://x/api/mcp", {
        method: "POST",
        headers: {
          authorization: "Bearer bc_mcp_abc",
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "get_artist", arguments: {} },
        }),
      }),
      { db: db as never, callerFor },
    );
    expect(response.status).toBe(200);
    expect(callerFor).toHaveBeenCalledWith(user, expect.any(Headers));
    const body = (await response.json()) as { result: { content: { text: string }[] } };
    expect(body.result.content[0]!.text).toContain("Artist: Nova");
  });
});
