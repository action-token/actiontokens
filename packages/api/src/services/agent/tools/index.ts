import { analyticsTools } from "./analytics";
import { brandTools } from "./brand";
import type { AgentTool } from "./define";
import { proposeTools } from "./propose";
import { searchTools } from "./search";
import { uiTools } from "./ui";

/** Every tool the map agent can call. */
export const AGENT_TOOLS: AgentTool[] = [
  ...searchTools,
  ...brandTools,
  ...analyticsTools,
  ...uiTools,
  ...proposeTools,
];
