import OpenAI from "openai";
import type { ResponseInputItem, ResponseOutputItem } from "openai/resources/responses/responses";
import { z } from "zod";

import { AppError, ErrorCodes } from "@bandcoin/errors";

/**
 * The agent's AI: OpenAI's Responses API with function tools, and its web
 * search for lists and events the map can't give. Everything the agent knows
 * comes from tools; the model name is overridable per environment.
 */
export const AGENT_MODEL = process.env.OPENAI_AGENT_MODEL ?? "gpt-5.4-mini";

export type ToolSpec = { name: string; description: string; schema: z.ZodType };
export type Item = ResponseInputItem;
export type Reply = {
  output: ResponseOutputItem[];
  text: string;
  calls: { id: string; name: string; args: unknown }[];
};

/** What the runner needs from the AI. Tests pass a fake. */
export type AgentModel = {
  respond(input: {
    instructions: string;
    items: Item[];
    tools: ToolSpec[];
    maxTokens?: number;
  }): Promise<Reply>;
  /** The model reads the web and answers in text (used for lists and events). */
  web(prompt: string): Promise<string>;
};

let client: OpenAI | undefined;
const openai = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey)
    throw new AppError(ErrorCodes.CONFIG_MISSING, {
      message: "The map assistant isn't switched on yet.",
      details: { name: "OPENAI_API_KEY" },
    });
  return (client ??= new OpenAI({ apiKey }));
};

const parameters = (schema: z.ZodType) => {
  const { $schema: _ignored, ...json } = z.toJSONSchema(schema) as Record<string, unknown>;
  return json;
};

export const openaiAgentModel: AgentModel = {
  async respond({ instructions, items, tools, maxTokens = 4000 }) {
    const response = await openai().responses.create({
      model: AGENT_MODEL,
      instructions,
      input: items,
      max_output_tokens: maxTokens,
      tools: tools.map((tool) => ({
        type: "function" as const,
        name: tool.name,
        description: tool.description,
        parameters: parameters(tool.schema),
        strict: false,
      })),
    });
    const calls = response.output
      .filter((item) => item.type === "function_call")
      .map((item) => {
        let args: unknown = {};
        try {
          args = JSON.parse(item.arguments || "{}");
        } catch {
          // The tool reports invalid arguments back to the model.
        }
        return { id: item.call_id, name: item.name, args };
      });
    return { output: response.output, text: response.output_text.trim(), calls };
  },

  async web(prompt) {
    const response = await openai().responses.create({
      model: AGENT_MODEL,
      input: prompt,
      max_output_tokens: 8000,
      tools: [{ type: "web_search" }],
    });
    return response.output_text;
  },
};
