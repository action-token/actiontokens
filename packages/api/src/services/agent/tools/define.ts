import type { z } from "zod";

import type { Run } from "../run";

/**
 * One shape for every agent tool. `label` is what the person sees while it
 * runs ("Searching parks in Clinton County…"); `run` returns what the model
 * reads and an optional outcome for the progress line ("Found 12 places").
 * Tools never receive an artist id from the model: they act for `run.artist`.
 */
export type ToolOutput = { model: unknown; detail?: string };

export type AgentTool<S extends z.ZodObject<z.ZodRawShape> = z.ZodObject<z.ZodRawShape>> = {
  name: string;
  description: string;
  schema: S;
  label: (args: z.infer<S>, run: Run) => string;
  run: (args: z.infer<S>, run: Run) => Promise<ToolOutput>;
  /** Shows no progress line (cheap, UI-only tools). */
  quiet?: boolean;
};

export function defineTool<S extends z.ZodObject<z.ZodRawShape>>(tool: AgentTool<S>): AgentTool {
  return tool as unknown as AgentTool;
}

/** "1 place" / "3 places". */
export const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** Parses a date the model wrote ("2026-11-01" or ISO). The error is a message the model can act on. */
export function parseDate(value: string, field: string): Date {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime()))
    throw new Error(`${field} "${value}" is not a date. Use YYYY-MM-DD.`);
  return date;
}

export const isoDay = (date: Date) => date.toISOString().slice(0, 10);
