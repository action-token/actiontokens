import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import type { Context, SessionUser } from "../../context";
import { createMcpServer, type AgentCaller } from "./mcp";
import { bearerMcpToken, mcpUser } from "./mcp-token";

/**
 * `/api/mcp`: the map agent over MCP's Streamable HTTP. Stateless: every POST
 * carries its own token and gets a fresh server, so it runs on serverless
 * functions without sticky sessions.
 */
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

export async function handleMcpPost(
  request: Request,
  deps: {
    db: Pick<Context, "db">["db"];
    callerFor: (user: SessionUser, headers: Headers) => AgentCaller;
  },
): Promise<Response> {
  const token = bearerMcpToken(request.headers.get("authorization"));
  const user = token ? await mcpUser(deps.db, token) : null;
  if (!user)
    return json(
      401,
      {
        error: "unauthorized",
        error_description:
          "Send an Action Tokens MCP token as `Authorization: Bearer bc_mcp_…` (Settings › AI apps).",
      },
      { "www-authenticate": 'Bearer realm="mcp"' },
    );
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await createMcpServer(deps.callerFor(user, request.headers), user.id).connect(transport);
  return transport.handleRequest(request);
}

/** No server-initiated stream or session to end in stateless mode. */
export const mcpNotAllowed = () =>
  json(
    405,
    { error: "method_not_allowed", error_description: "POST MCP requests here." },
    { allow: "POST" },
  );
