/** The name AI apps know the server by. */
export const SERVER_NAME = "bandcoin";

export type AppSetup = { id: string; label: string; where: string; code: string };

/** How each AI app is told about the server, with the token in its auth header. */
export function appSetups(url: string, token: string): AppSetup[] {
  const auth = `Bearer ${token}`;
  const json = (value: unknown) => JSON.stringify(value, null, 2);
  const urlAndHeaders = (urlKey: string) =>
    json({ mcpServers: { [SERVER_NAME]: { [urlKey]: url, headers: { Authorization: auth } } } });
  return [
    {
      id: "claude-desktop",
      label: "Claude Desktop",
      where:
        "Settings → Developer → Edit Config (claude_desktop_config.json), then restart Claude.",
      code: json({
        mcpServers: {
          [SERVER_NAME]: {
            command: "npx",
            args: ["-y", "mcp-remote", url, "--header", "Authorization:${BANDCOIN_MCP_AUTH}"],
            env: { BANDCOIN_MCP_AUTH: auth },
          },
        },
      }),
    },
    {
      id: "claude-code",
      label: "Claude Code",
      where: "Run in a terminal.",
      code: `claude mcp add --transport http ${SERVER_NAME} ${url} --header "Authorization: ${auth}"`,
    },
    {
      id: "codex",
      label: "OpenAI Codex",
      where: "Add to ~/.codex/config.toml.",
      code: `[mcp_servers.${SERVER_NAME}]\nurl = "${url}"\nhttp_headers = { "Authorization" = "${auth}" }`,
    },
    {
      id: "openai-api",
      label: "OpenAI API",
      where: "A tool in a Responses API request (or the Agents SDK's hosted MCP tool).",
      code: json({
        type: "mcp",
        server_label: SERVER_NAME,
        server_url: url,
        headers: { Authorization: auth },
        require_approval: "always",
      }),
    },
    {
      id: "antigravity",
      label: "Antigravity",
      where:
        "Agent panel → … → MCP Servers → Manage MCP Servers → View raw config (mcp_config.json).",
      code: urlAndHeaders("serverUrl"),
    },
    {
      id: "cursor",
      label: "Cursor",
      where: "~/.cursor/mcp.json (or .cursor/mcp.json in a project).",
      code: urlAndHeaders("url"),
    },
    {
      id: "vscode",
      label: "VS Code",
      where: ".vscode/mcp.json in a workspace (GitHub Copilot agent mode).",
      code: json({
        servers: { [SERVER_NAME]: { type: "http", url, headers: { Authorization: auth } } },
      }),
    },
    {
      id: "gemini",
      label: "Gemini CLI",
      where: "~/.gemini/settings.json.",
      code: urlAndHeaders("httpUrl"),
    },
    {
      id: "windsurf",
      label: "Windsurf",
      where: "~/.codeium/windsurf/mcp_config.json.",
      code: urlAndHeaders("serverUrl"),
    },
    {
      id: "other",
      label: "Other",
      where:
        "Any app that supports remote (Streamable HTTP) MCP servers with headers. One that can't send headers can run it through mcp-remote.",
      code: `${urlAndHeaders("url")}\n\n# Without header support:\nnpx -y mcp-remote ${url} --header "Authorization: ${auth}"`,
    },
  ];
}
