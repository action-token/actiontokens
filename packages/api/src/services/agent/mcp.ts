import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { isAppError } from "@actiontokens/errors";

import { agentRouter } from "../../routers/artist/agent";
import { createCallerFactory } from "../../trpc";
import { ActionEditsInput } from "./actions";
import { formatMessage } from "./mcp-format";

/**
 * The map agent as an MCP server, for AI apps (Claude, Cursor…). The same chat
 * as in Studio, as tools. Every tool calls the agent router as the token's
 * person, so who may act, per-person conversations, the daily AI limit and
 * "nothing changes until confirmed" all work exactly as in the app.
 */
const makeAgentCaller = createCallerFactory(agentRouter);
export type AgentCaller = ReturnType<typeof makeAgentCaller>;

/** How long one tool call waits for the agent (the host's function allows about a minute). */
const WAIT_MS = 45_000;
const POLL_EVERY_MS = 1_500;

const text = (value: string): CallToolResult => ({ content: [{ type: "text", text: value }] });
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** "GABC…WXYZ", so logs show who without the whole account id. */
const shortId = (id: string) => (id.length > 12 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id);

/** Runs a tool: the API's errors become a message the AI can read, and each call logs one line. */
async function runTool(name: string, userId: string, run: () => Promise<CallToolResult>) {
  const started = Date.now();
  const took = () => `${((Date.now() - started) / 1000).toFixed(1)}s`;
  try {
    const result = await run();
    console.info(`[mcp] ${name} ${shortId(userId)} ${took()} ${result.isError ? "error" : "ok"}`);
    return result;
  } catch (error) {
    const message = isAppError(error) ? error.message : "Something went wrong.";
    console.info(`[mcp] ${name} ${shortId(userId)} ${took()} error: ${message}`);
    if (!isAppError(error)) console.error("[mcp]", error);
    return { isError: true, content: [{ type: "text" as const, text: message }] };
  }
}

/** Waits for a run, then shows its reply with the conversation's proposal states. */
export async function awaitReply(
  agent: AgentCaller,
  jobId: string,
  conversationId: string | undefined,
  wait = { ms: WAIT_MS, every: POLL_EVERY_MS },
): Promise<CallToolResult> {
  const deadline = Date.now() + wait.ms;
  for (;;) {
    const job = await agent.poll({ jobId });
    if (job.status === "FAILED")
      return { isError: true, ...text(job.error ?? "The agent failed.") };
    if (job.status === "SUCCEEDED") {
      if (!job.message) return text("The agent finished without a reply.");
      const actions = conversationId
        ? (await agent.conversation({ id: conversationId })).actions
        : {};
      return text(
        [
          conversationId ? `Conversation \`${conversationId}\`` : "",
          formatMessage(job.message, actions),
        ]
          .filter(Boolean)
          .join("\n\n"),
      );
    }
    if (Date.now() > deadline) {
      const progress = job.steps.map((s) => `- ${s.label} [${s.status}]`).join("\n");
      return text(
        `The agent is still working (job \`${jobId}\`). Call get_reply with this jobId to wait for it.` +
          (progress ? `\n\nProgress:\n${progress}` : ""),
      );
    }
    await sleep(wait.every);
  }
}

export function createMcpServer(
  agent: AgentCaller,
  userId: string,
  wait?: { ms: number; every: number },
) {
  const safely = (name: string, run: () => Promise<CallToolResult>) => runTool(name, userId, run);
  const server = new McpServer(
    { name: "Bandcoin map agent", version: "1.0.0" },
    {
      instructions:
        "Bandcoin's map agent for one artist. It finds real places and events, reports on the artist's pins, " +
        "hotspots, events and announcements, and prepares changes to them. Start with ask_agent. " +
        "Changes are proposals: nothing happens until confirm_proposal is called, so show the person what a proposal " +
        "does and ask before confirming.",
    },
  );

  server.registerTool(
    "get_artist",
    {
      title: "Artist overview",
      description: "The artist the agent acts for, and example requests.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () =>
      safely("get_artist", async () => {
        const overview = await agent.overview();
        return text(
          [
            `Artist: ${overview.artist.name} (\`${overview.artist.id}\`)`,
            `Try:\n${overview.suggestions.map((s) => `- ${s}`).join("\n")}`,
          ].join("\n"),
        );
      }),
  );

  server.registerTool(
    "ask_agent",
    {
      title: "Ask the map agent",
      description:
        "Sends a message to the map agent and returns its answer: text plus cards (places found, pins, reports, " +
        "questions, proposals). Leave out conversationId to start a new conversation; pass it to continue one. " +
        "Each message counts toward the artist's daily AI limit. If the agent needs longer than about 45 seconds " +
        "the result gives a jobId for get_reply.",
      inputSchema: {
        text: z.string().min(1).max(2000).describe("The message, in plain language."),
        conversationId: z.string().optional().describe("Continue this conversation."),
        timeZone: z
          .string()
          .max(60)
          .optional()
          .describe(
            'IANA time zone, e.g. "America/Chicago", so "this weekend" means the right dates.',
          ),
        answer: z
          .object({
            messageId: z.string(),
            blockId: z.string(),
            labels: z.array(z.string().max(200)).max(20),
          })
          .optional()
          .describe("When replying to a question card: which options were picked."),
      },
    },
    (input) =>
      safely("ask_agent", async () => {
        const sent = await agent.send(input);
        return awaitReply(agent, sent.jobId, sent.conversationId, wait);
      }),
  );

  server.registerTool(
    "get_reply",
    {
      title: "Wait for the agent's reply",
      description: "Waits for a reply that ask_agent said is still in progress.",
      inputSchema: {
        jobId: z.string(),
        conversationId: z.string().optional().describe("Shows proposal states with the reply."),
      },
      annotations: { readOnlyHint: true },
    },
    ({ jobId, conversationId }) =>
      safely("get_reply", () => awaitReply(agent, jobId, conversationId, wait)),
  );

  server.registerTool(
    "list_conversations",
    {
      title: "List conversations",
      description: "Your 40 most recent conversations with the agent.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () =>
      safely("list_conversations", async () => {
        const rows = await agent.conversations();
        if (rows.length === 0) return text("No conversations yet.");
        return text(
          rows
            .map(
              (c) =>
                `- \`${c.id}\` ${c.title ?? "Untitled"} (updated ${c.updatedAt.toISOString().slice(0, 16)})`,
            )
            .join("\n"),
        );
      }),
  );

  server.registerTool(
    "get_conversation",
    {
      title: "Read a conversation",
      description:
        "A conversation's messages with their cards and the current state of each proposal.",
      inputSchema: { conversationId: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ conversationId }) =>
      safely("get_conversation", async () => {
        const c = await agent.conversation({ id: conversationId });
        return text(
          [
            `## ${c.title ?? "Conversation"}`,
            ...c.messages.map((m) => formatMessage(m, c.actions)),
          ].join("\n\n"),
        );
      }),
  );

  server.registerTool(
    "delete_conversation",
    {
      title: "Delete a conversation",
      description: "Deletes a conversation and its messages. Changes already made stay.",
      inputSchema: { conversationId: z.string() },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    ({ conversationId }) =>
      safely("delete_conversation", async () => {
        await agent.deleteConversation({ id: conversationId });
        return text("Conversation deleted.");
      }),
  );

  server.registerTool(
    "confirm_proposal",
    {
      title: "Confirm a proposal",
      description:
        "Carries out a proposal the agent prepared (an `act_…` id from its reply). This changes the artist's live " +
        "data: get the person's go-ahead first. Edits: for create_pins, `keep` limits it to some place keys and " +
        "`defaults` changes dates, type, radius and limits; for creating a hotspot, event or announcement, `draft` " +
        "changes fields of the draft. A rejected edit can be fixed and confirmed again.",
      inputSchema: {
        actionId: z.string(),
        keep: ActionEditsInput.shape.keep,
        defaults: ActionEditsInput.shape.defaults,
        // One type per field so every client can read the schema; the same rules as the card check them.
        draft: z
          .object({
            title: z.string(),
            description: z.string(),
            body: z.string().describe("Announcement text"),
            startDate: z.string().describe("YYYY-MM-DD or ISO date-time"),
            endDate: z.string(),
            expiresAt: z.string().describe("Announcement expiry"),
            venueName: z.string(),
            address: z.string(),
            lat: z.number(),
            lng: z.number(),
            link: z.string(),
            capacity: z.number(),
            pinned: z.boolean(),
            ctaLabel: z.string(),
            ctaUrl: z.string(),
            radiusMetres: z.number(),
            type: z.string().describe("Pin type, e.g. LANDMARK or EVENT"),
            dropEveryDays: z.number(),
            pinDurationDays: z.number(),
            pinNumber: z.number(),
            collectionLimit: z.number(),
            autoCollect: z.boolean(),
          })
          .partial()
          .optional()
          .describe(
            "Changed fields of a hotspot, event or announcement draft. Only the ones to change.",
          ),
      },
      annotations: { destructiveHint: true },
    },
    ({ actionId, keep, defaults, draft }) =>
      safely("confirm_proposal", async () => {
        const result = await agent.confirm({ actionId, edits: { keep, defaults, draft } });
        return text(
          result.message +
            (result.pinJobId
              ? `\nPins are being created in the background: check with get_pin_job (jobId \`${result.pinJobId}\`).`
              : ""),
        );
      }),
  );

  server.registerTool(
    "cancel_proposal",
    {
      title: "Cancel a proposal",
      description: "Turns down a proposal; nothing is changed.",
      inputSchema: { actionId: z.string() },
      annotations: { idempotentHint: true },
    },
    ({ actionId }) =>
      safely("cancel_proposal", async () => {
        await agent.cancel({ actionId });
        return text("Proposal cancelled.");
      }),
  );

  server.registerTool(
    "get_pin_job",
    {
      title: "Pin creation progress",
      description: "Progress of pins being created after a create_pins proposal was confirmed.",
      inputSchema: { jobId: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ jobId }) =>
      safely("get_pin_job", async () => {
        const job = await agent.pinJob({ jobId });
        return text(
          [
            `Status: ${job.status}, ${job.completed}/${job.total} done`,
            job.failed.length ? `Failed: ${job.failed.join(", ")}` : "",
            job.error ?? "",
          ]
            .filter(Boolean)
            .join("\n"),
        );
      }),
  );

  return server;
}
