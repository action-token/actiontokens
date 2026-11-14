import type { Prisma } from "@bandcoin/db";
import { AppError, ErrorCodes, isAppError } from "@bandcoin/errors";

import type { Context, SessionUser } from "../../context";
import { withAiQuota } from "../ai/quota";
import { enqueueJob } from "../jobs/queue";
import { executeAction } from "./actions";
import { batchStatus } from "./batch";
import type {
  ActionEdits,
  ActionStatus,
  AgentBlock,
  AgentJobResult,
  AgentRunPayload,
  AgentStep,
  ProposedAction,
} from "./contract";

/**
 * The agent chat: conversations belong to one artist and one person, a message
 * starts a worker run, and the run's live steps and answer are read back by
 * polling. The agent only proposes; a proposal changes nothing until the
 * artist confirms it here, and it runs once.
 */
type ServiceCtx = Pick<Context, "db" | "activity">;
type ArtistRef = { id: string; name: string };

export const AGENT_JOB = "agent.run";
const MESSAGES_PER_CONVERSATION = 200;
const MAX_TEXT = 2000;

const messageSelect = {
  id: true,
  role: true,
  text: true,
  blocks: true,
  steps: true,
  createdAt: true,
} as const;

type MessageRow = {
  id: string;
  role: string;
  text: string;
  blocks: Prisma.JsonValue;
  steps: Prisma.JsonValue;
  createdAt: Date;
};

export function toMessage(row: MessageRow) {
  return {
    id: row.id,
    role: row.role === "assistant" ? ("assistant" as const) : ("user" as const),
    text: row.text,
    blocks: (Array.isArray(row.blocks) ? row.blocks : []) as unknown as AgentBlock[],
    steps: (Array.isArray(row.steps) ? row.steps : []) as unknown as AgentStep[],
    createdAt: row.createdAt,
  };
}
export type AgentMessage = ReturnType<typeof toMessage>;

const notFound = (what: string) =>
  new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: `${what} not found` });

/** The person's own conversation for this artist (not found otherwise). */
async function ownConversation(ctx: ServiceCtx, artist: ArtistRef, user: SessionUser, id: string) {
  const conversation = await ctx.db.agentConversation.findFirst({
    where: { id, artistId: artist.id, userId: user.id },
    select: { id: true, title: true },
  });
  if (!conversation) throw notFound("Conversation");
  return conversation;
}

export function overview(artist: ArtistRef, area?: string) {
  const where = area ?? "my area";
  return {
    artist: { id: artist.id, name: artist.name },
    suggestions: [
      `Find all public parks in ${where} and pin them`,
      "Which of my pins were collected most this month?",
      `Find upcoming events in ${where} this weekend`,
      "Show my pins that expire in the next 7 days",
    ],
  };
}

export const listConversations = (ctx: ServiceCtx, artist: ArtistRef, user: SessionUser) =>
  ctx.db.agentConversation.findMany({
    where: { artistId: artist.id, userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 40,
    select: { id: true, title: true, updatedAt: true },
  });

async function actionStates(ctx: ServiceCtx, conversationId: string) {
  const rows = await ctx.db.agentAction.findMany({
    where: { conversationId },
    select: { id: true, status: true, result: true },
  });
  return Object.fromEntries(
    rows.map((row) => [
      row.id,
      {
        status: row.status as ActionStatus,
        result: row.result as { message?: string; pinJobId?: string } | null,
      },
    ]),
  );
}

export async function getConversation(
  ctx: ServiceCtx,
  artist: ArtistRef,
  user: SessionUser,
  id: string,
) {
  const conversation = await ownConversation(ctx, artist, user, id);
  const [rows, actions] = await Promise.all([
    ctx.db.agentMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: MESSAGES_PER_CONVERSATION,
      select: messageSelect,
    }),
    actionStates(ctx, conversation.id),
  ]);
  return {
    id: conversation.id,
    title: conversation.title,
    messages: rows.reverse().map(toMessage),
    actions,
  };
}

export async function deleteConversation(
  ctx: ServiceCtx,
  artist: ArtistRef,
  user: SessionUser,
  id: string,
) {
  await ownConversation(ctx, artist, user, id);
  await ctx.db.agentConversation.delete({ where: { id } });
  return { id };
}

/** Records the options picked on a question card, so it shows as answered. */
async function markAnswered(
  ctx: ServiceCtx,
  conversationId: string,
  answer: { messageId: string; blockId: string; labels: string[] },
) {
  const message = await ctx.db.agentMessage.findFirst({
    where: { id: answer.messageId, conversationId, role: "assistant" },
    select: { blocks: true },
  });
  if (!message || !Array.isArray(message.blocks)) return;
  const blocks = (message.blocks as unknown as AgentBlock[]).map((block) =>
    block.kind === "choices" && block.id === answer.blockId
      ? { ...block, answered: answer.labels }
      : block,
  );
  await ctx.db.agentMessage.update({
    where: { id: answer.messageId },
    data: { blocks: blocks as unknown as Prisma.InputJsonValue },
  });
}

/**
 * Sends a message (starting a conversation if needed) and queues the run. Each
 * message counts as one of the artist's daily AI generations (admins aren't
 * limited); a run that couldn't start costs nothing.
 */
export async function sendMessage(
  ctx: ServiceCtx,
  artist: ArtistRef,
  user: SessionUser,
  input: {
    conversationId?: string;
    text: string;
    timeZone?: string;
    answer?: { messageId: string; blockId: string; labels: string[] };
  },
) {
  const text = input.text.trim();
  if (text.length === 0 || text.length > MAX_TEXT)
    throw new AppError(ErrorCodes.VALIDATION_FAILED, {
      message: `Write a message of up to ${MAX_TEXT.toLocaleString("en-US")} characters.`,
    });
  return withAiQuota(
    ctx,
    { userId: user.id, unlimited: user.role === "ADMIN" },
    "text",
    async () => {
      const conversation = input.conversationId
        ? await ownConversation(ctx, artist, user, input.conversationId)
        : await ctx.db.agentConversation.create({
            data: { artistId: artist.id, userId: user.id, title: text.slice(0, 80) },
            select: { id: true, title: true },
          });
      if (input.answer) await markAnswered(ctx, conversation.id, input.answer);

      const userMessage = await ctx.db.agentMessage.create({
        data: { conversationId: conversation.id, role: "user", text },
        select: messageSelect,
      });
      await ctx.db.agentConversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      });

      const agentJob = await ctx.db.agentJob.create({
        data: { artistId: artist.id, status: "QUEUED", payload: {} },
        select: { id: true },
      });
      const payload: AgentRunPayload = {
        conversationId: conversation.id,
        artistId: artist.id,
        agentJobId: agentJob.id,
        timeZone: input.timeZone,
      };
      await ctx.db.agentJob.update({ where: { id: agentJob.id }, data: { payload } });
      // One attempt: the person can simply ask again, and a retry could answer twice.
      await enqueueJob(ctx.db, AGENT_JOB, payload, { maxAttempts: 1 });
      ctx.activity.set({ targetType: "AgentJob", targetId: agentJob.id });
      return {
        conversationId: conversation.id,
        jobId: agentJob.id,
        userMessage: toMessage(userMessage),
      };
    },
  );
}

/** A run still going after this long was lost (the worker restarted). */
export const RUN_STALL_MS = 10 * 60_000;

/** Live steps of a run while it works, then its saved answer. */
export async function pollRun(
  ctx: ServiceCtx,
  artist: ArtistRef,
  user: SessionUser,
  jobId: string,
  now = new Date(),
) {
  const job = await ctx.db.agentJob.findFirst({
    where: { id: jobId, artistId: artist.id },
    select: { status: true, payload: true, result: true, updatedAt: true },
  });
  const conversationId = (job?.payload as { conversationId?: string } | null)?.conversationId;
  if (!job || !conversationId) throw notFound("Job");
  await ownConversation(ctx, artist, user, conversationId);

  const result = (job.result ?? {}) as Partial<AgentJobResult>;
  const steps = result.steps ?? [];
  const running = job.status === "QUEUED" || job.status === "RUNNING";
  const stalled = running && now.getTime() - job.updatedAt.getTime() > RUN_STALL_MS;
  if (job.status !== "SUCCEEDED") {
    const failed = stalled || job.status === "FAILED" || job.status === "CANCELED";
    return {
      status: failed ? ("FAILED" as const) : job.status,
      steps,
      error: failed ? "The assistant couldn't finish. Please try again." : undefined,
      message: null,
    };
  }
  const row = result.messageId
    ? await ctx.db.agentMessage.findFirst({
        where: { id: result.messageId, conversationId },
        select: messageSelect,
      })
    : null;
  return { status: job.status, steps, error: undefined, message: row ? toMessage(row) : null };
}

/** Carries out a proposal the person confirmed (once), with their edits from the card. */
export async function confirmAction(
  ctx: ServiceCtx,
  artist: ArtistRef,
  user: SessionUser,
  input: { actionId: string; edits?: ActionEdits; layerId?: string | null },
) {
  const action = await ctx.db.agentAction.findFirst({
    where: { id: input.actionId, artistId: artist.id, conversation: { userId: user.id } },
    select: { id: true, payload: true },
  });
  if (!action) throw notFound("Proposal");

  // Claim it: only a pending proposal runs, and only once.
  const { count } = await ctx.db.agentAction.updateMany({
    where: { id: action.id, status: "pending" },
    data: { status: "running" },
  });
  if (count === 0)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: "This proposal was already handled",
    });

  try {
    const result = await executeAction(
      ctx,
      artist,
      action.payload as unknown as ProposedAction,
      input.edits,
      input.layerId ?? null,
    );
    await ctx.db.agentAction.update({ where: { id: action.id }, data: { status: "done", result } });
    return { status: "done" as const, ...result };
  } catch (error) {
    const message = isAppError(error)
      ? error.message
      : "Couldn't complete this change. Please try again.";
    // A rejected input can be fixed on the card and tried again; anything else stays failed.
    const retryable = isAppError(error) && error.code === ErrorCodes.VALIDATION_FAILED;
    await ctx.db.agentAction.update({
      where: { id: action.id },
      data: { status: retryable ? "pending" : "failed", result: { message } },
    });
    if (isAppError(error)) throw error;
    console.error("[agent.confirm]", error);
    throw new AppError(ErrorCodes.INTERNAL);
  }
}

export async function cancelAction(
  ctx: ServiceCtx,
  artist: ArtistRef,
  user: SessionUser,
  actionId: string,
) {
  const { count } = await ctx.db.agentAction.updateMany({
    where: {
      id: actionId,
      artistId: artist.id,
      status: "pending",
      conversation: { userId: user.id },
    },
    data: { status: "cancelled" },
  });
  if (count === 0)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: "This proposal was already handled",
    });
  return { status: "cancelled" as const };
}

export async function pinJobStatus(
  ctx: ServiceCtx,
  artist: ArtistRef,
  jobId: string,
  now = new Date(),
) {
  const status = await batchStatus(ctx, artist, jobId, now);
  if (!status) throw notFound("Job");
  return status;
}
