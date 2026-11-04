import { handleMcpPost, mcpNotAllowed } from "@bandcoin/api";
import { db } from "@bandcoin/db/server";

import { agentCallerFor } from "~/server/api";

/** The map agent for AI apps (Settings › AI apps makes the token). */
export const POST = (request: Request) => handleMcpPost(request, { db, callerFor: agentCallerFor });
export const GET = mcpNotAllowed;
export const DELETE = mcpNotAllowed;

// An agent run can take most of a minute.
export const maxDuration = 60;
