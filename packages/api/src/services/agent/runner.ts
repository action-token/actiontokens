import type { Context } from "../../context";
import { type ArtistContext, loadArtistContext } from "./context";
import type { AgentBlock, AgentJobResult, AgentRunPayload } from "./contract";
import { AGENT_MODEL, type AgentModel, type Item } from "./model";
import { systemPrompt } from "./prompt";
import { Run, type ResultSet } from "./run";
import { loadHistory, saveAnswer } from "./store";
import { AGENT_TOOLS } from "./tools";

/**
 * One run of the map agent: read the conversation, let the model call tools
 * (each shown live as a progress step) until it answers or asks a question,
 * then save the answer with its cards and proposals.
 */
type ServiceCtx = Pick<Context, "db">;

/** Model and tool round trips per message. Plenty for search → show → propose chains. */
export const MAX_ROUNDS = 10;
const byName = new Map(AGENT_TOOLS.map((tool) => [tool.name, tool]));
const SORRY = "Sorry, something went wrong on my side while working on that. Please try again.";

/** Earlier cards become result sets again, so "pin those parks" works on the next message. */
function restoreResults(run: Run, blocks: AgentBlock[]) {
  for (const block of blocks) {
    let set: ResultSet | null = null;
    switch (block.kind) {
      case "places":
        set = { kind: "places", title: block.title, items: block.items, area: block.area };
        break;
      case "pins":
      case "hotspots":
      case "events":
      case "announcements":
        set = { kind: block.kind, title: block.title, items: block.items } as ResultSet;
        break;
    }
    if (set) run.results.set(block.id, set);
  }
}

export function validZone(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 60) return undefined;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return undefined;
  }
}

/**
 * Runs one tool call with a visible progress step. Errors go back to the model
 * as text it can act on; the person only sees that the step didn't finish.
 */
async function callTool(run: Run, name: string, rawArgs: unknown): Promise<string> {
  const tool = byName.get(name);
  if (!tool) return JSON.stringify({ error: `No tool named ${name}.` });
  const parsed = tool.schema.safeParse(rawArgs);
  if (!parsed.success)
    return JSON.stringify({
      error: "Invalid arguments",
      issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  const step = tool.quiet ? null : run.step(tool.label(parsed.data, run));
  try {
    const out = await tool.run(parsed.data, run);
    step?.done(out.detail);
    return JSON.stringify(out.model);
  } catch (error) {
    step?.fail("Couldn't finish this step");
    return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
  }
}

/** The worker's `agent.run`: one message, start to finish. Returns the saved answer's id. */
export async function runAgent(
  ctx: ServiceCtx,
  payload: AgentRunPayload,
  deps: { model: AgentModel; now?: Date },
) {
  const { agentJobId } = payload;
  // Take the run once: a second worker finds it already running.
  const { count } = await ctx.db.agentJob.updateMany({
    where: { id: agentJobId, status: "QUEUED" },
    data: { status: "RUNNING" },
  });
  if (count !== 1) return { agentJobId, outcome: "SKIPPED" as const };

  let artist: ArtistContext;
  try {
    artist = await loadArtistContext(ctx, payload.organizationId, deps.now);
  } catch (error) {
    await ctx.db.agentJob.update({
      where: { id: agentJobId },
      data: {
        status: "FAILED",
        error: error instanceof Error ? error.message : "Artist not found",
      },
    });
    return { agentJobId, outcome: "FAILED" as const };
  }
  const run = new Run(ctx, agentJobId, artist, payload.conversationId, deps.model);
  const reading = run.step("Understanding your request…");

  let answer = "";
  try {
    const { turns, earlierBlocks } = await loadHistory(ctx.db, payload.conversationId, artist.id);
    restoreResults(run, earlierBlocks);
    const instructions = systemPrompt(artist, validZone(payload.timeZone), deps.now);
    const items: Item[] = turns.map((turn) => ({ role: turn.role, content: turn.text }));

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const reply = await deps.model.respond({ instructions, items, tools: AGENT_TOOLS });
      if (round === 0) reading.done();
      items.push(...(reply.output as Item[]));
      if (reply.calls.length === 0) {
        answer = reply.text;
        break;
      }
      for (const call of reply.calls)
        items.push({
          type: "function_call_output",
          call_id: call.id,
          output: await callTool(run, call.name, call.args),
        });
      if (run.asked) {
        answer = reply.text;
        break;
      }
      if (round === MAX_ROUNDS - 1) {
        // Out of rounds: ask for a final answer without more tool calls.
        items.push({
          role: "user",
          content: "(System: no more tool calls. Answer now with what you have.)",
        });
        answer = (await deps.model.respond({ instructions, items, tools: [], maxTokens: 1000 }))
          .text;
      }
    }
  } catch (error) {
    console.error("[agent] run failed", { agentJobId, model: AGENT_MODEL, error });
    reading.done();
    run.step("Something went wrong").fail();
    answer = SORRY;
  }

  if (!answer)
    answer = run.asked
      ? ""
      : run.blocks.length || run.actions.length
        ? "Here's what I found."
        : "Done.";
  const messageId = await saveAnswer(run, answer);
  const result: AgentJobResult = { steps: run.steps, messageId };
  await ctx.db.agentJob.update({
    where: { id: agentJobId },
    data: { status: "SUCCEEDED", result: JSON.parse(JSON.stringify(result)) as object },
  });
  return { agentJobId, outcome: "DONE" as const, messageId };
}
