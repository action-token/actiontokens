import { describe, expect, it } from "vitest";

import { appSetups, SERVER_NAME } from "./ai-app-setups";

const URL = "https://org.action-tokens.com/api/mcp";
const TOKEN = "bc_mcp_abc123";

describe("how each AI app is told about the server", () => {
  const setups = appSetups(URL, TOKEN);

  it("covers the apps Wadzzo's connections tab covers, once each", () => {
    expect(setups.map((s) => s.label)).toEqual([
      "Claude Desktop",
      "Claude Code",
      "OpenAI Codex",
      "OpenAI API",
      "Antigravity",
      "Cursor",
      "VS Code",
      "Gemini CLI",
      "Windsurf",
      "Other",
    ]);
    expect(new Set(setups.map((s) => s.id)).size).toBe(setups.length);
  });

  it("names the server for Action Tokens", () => {
    expect(SERVER_NAME).toBe("actiontokens");
  });

  it("puts the address and the token in every snippet", () => {
    for (const s of setups) {
      expect(s.code, s.label).toContain(URL);
      expect(s.code, s.label).toContain(TOKEN);
    }
  });

  it("sends the token as a bearer header", () => {
    for (const s of setups) expect(s.code, s.label).toContain(`Bearer ${TOKEN}`);
  });

  it("gives Claude Code the one-line command", () => {
    const claudeCode = setups.find((s) => s.id === "claude-code")!;
    expect(claudeCode.code).toBe(
      `claude mcp add --transport http actiontokens ${URL} --header "Authorization: Bearer ${TOKEN}"`,
    );
  });

  it("writes the config-file snippets as valid JSON", () => {
    for (const id of [
      "claude-desktop",
      "openai-api",
      "antigravity",
      "cursor",
      "vscode",
      "gemini",
      "windsurf",
    ]) {
      const s = setups.find((x) => x.id === id)!;
      expect(() => {
        JSON.parse(s.code);
      }, s.label).not.toThrow();
    }
  });

  it("uses a placeholder until a token exists", () => {
    const empty = appSetups(URL, "YOUR_TOKEN");
    expect(empty.every((s) => s.code.includes("Bearer YOUR_TOKEN"))).toBe(true);
  });
});
