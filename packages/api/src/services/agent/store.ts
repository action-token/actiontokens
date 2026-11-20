import type { Prisma } from "@actiontokens/db";

import type { Context } from "../../context";
import type { ActionStatus, AgentBlock } from "./contract";
import type { Run } from "./run";

/**
 * Reads a conversation's history for the model and saves the agent's answer.
 * The only things the run writes for the agent are AgentMessage and
 * AgentAction (proposals, carried out after the artist confirms).
 */
type Db = Pick<Context, "db">["db"];
const HISTORY_MESSAGES = 30;

export type HistoryTurn = { role: "user" | "assistant"; text: string };

/** The conversation's recent turns as text the model can read, plus its earlier cards. */
export async function loadHistory(db: Db, conversationId: string, artistId: string) {
  const conversation = await db.agentConversation.findUnique({
    where: { id: conversationId },
    select: { artistId: true },
  });
  if (!conversation || conversation.artistId !== artistId)
    throw new Error("Conversation not found for this artist");

  const [rows, actions] = await Promise.all([
    db.agentMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: HISTORY_MESSAGES,
      select: { role: true, text: true, blocks: true },
    }),
    db.agentAction.findMany({
      where: { conversationId },
      select: { id: true, status: true, result: true },
    }),
  ]);
  const statusOf = new Map(actions.map((a) => [a.id, a]));
  const messages = rows.reverse();
  const turns: HistoryTurn[] = messages.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    text: m.role === "assistant" ? withCardNotes(m.text, asBlocks(m.blocks), statusOf) : m.text,
  }));
  const earlierBlocks = messages
    .filter((m) => m.role === "assistant")
    .flatMap((m) => asBlocks(m.blocks));
  return { turns, earlierBlocks };
}

const asBlocks = (json: Prisma.JsonValue): AgentBlock[] =>
  Array.isArray(json) ? (json as unknown as AgentBlock[]) : [];

/** "[card: …]" notes so the model remembers what it showed and what happened to proposals. */
export function withCardNotes(
  text: string,
  blocks: AgentBlock[],
  actions: Map<string, { status: string; result: Prisma.JsonValue }>,
): string {
  const notes = blocks.map((block) => {
    switch (block.kind) {
      case "choices":
        return `[asked: "${block.question}" options: ${block.options.map((o) => o.label).join(" | ")}${block.answered ? ` → answered: ${block.answered.join(", ")}` : ""}]`;
      case "proposal": {
        const action = actions.get(block.actionId);
        const status = (action?.status ?? "pending") as ActionStatus;
        const result = action?.result;
        const outcome =
          result && typeof result === "object" && "message" in result
            ? ` (${String((result as { message: unknown }).message)})`
            : "";
        return `[proposed ${block.action.type}: ${block.summary} → ${status}${outcome}]`;
      }
      case "report":
        return `[report ref=${block.id}: ${block.title}]`;
      case "collectors":
        return `[collectors ref=${block.id}: ${block.total} collectors shown]`;
      default:
        return `[${block.kind} ref=${block.id}: "${block.title}", ${block.items.length} items]`;
    }
  });
  return [text, ...notes].filter(Boolean).join("\n");
}

/** Saves the answer: its proposals first (so the cards can point at them), then the message. */
export async function saveAnswer(run: Run, text: string): Promise<string> {
  const proposals: AgentBlock[] = run.actions.map((a) => ({
    kind: "proposal",
    id: a.id,
    actionId: a.id,
    action: a.action,
    summary: a.summary,
  }));
  const blocks = [...run.blocks, ...proposals];
  await run.flush();
  const message = await run.ctx.db.$transaction(async (tx) => {
    if (run.actions.length > 0)
      await tx.agentAction.createMany({
        data: run.actions.map((a) => ({
          id: a.id,
          conversationId: run.conversationId,
          artistId: run.artist.id,
          type: a.action.type,
          payload: a.action as unknown as Prisma.InputJsonValue,
          status: "pending",
        })),
      });
    const saved = await tx.agentMessage.create({
      data: {
        conversationId: run.conversationId,
        role: "assistant",
        text,
        blocks: blocks as unknown as Prisma.InputJsonValue,
        steps: run.steps as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    await tx.agentConversation.update({
      where: { id: run.conversationId },
      data: { updatedAt: new Date() },
    });
    return saved;
  });
  return message.id;
}
