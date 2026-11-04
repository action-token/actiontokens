"use client";

import { Check, Copy, Loader2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { Skeleton } from "@bandcoin/ui/components/skeleton";

import { api } from "~/trpc/react";

const when = (date: Date | string | null) =>
  date ? new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "never";

function CopyBox({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-1.5">
      <p className="text-fg-muted text-xs">{label}</p>
      <div className="bg-surface-2 flex items-start gap-2 rounded-xl p-3">
        <code className="min-w-0 flex-1 text-xs break-all whitespace-pre-wrap">{value}</code>
        <button
          type="button"
          aria-label={`Copy ${label}`}
          className="text-fg-muted hover:text-fg shrink-0"
          onClick={() =>
            void navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
          }
        >
          {copied ? <Check className="text-success size-4" /> : <Copy className="size-4" />}
        </button>
      </div>
    </div>
  );
}

/**
 * Settings › AI apps: let an AI app (Claude, Cursor…) use your map agent. A token
 * is shown once, when it's made. The app can only ask questions and prepare
 * changes; nothing changes until a proposal is confirmed.
 */
export function AiAppsTab() {
  const utils = api.useUtils();
  const tokens = api.mcpTokens.list.useQuery();
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<{ token: string; name: string } | null>(null);
  const create = api.mcpTokens.create.useMutation({
    onSuccess: (made) => {
      setFresh({ token: made.token, name: made.name });
      setName("");
      void utils.mcpTokens.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const revoke = api.mcpTokens.revoke.useMutation({
    onSuccess: () => {
      toast.success("Token revoked. Apps using it stop working.");
      void utils.mcpTokens.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const endpoint = typeof window === "undefined" ? "/api/mcp" : `${window.location.origin}/api/mcp`;

  return (
    <div className="grid max-w-xl gap-6">
      <div className="grid gap-3">
        <p className="text-fg-muted text-sm">
          Make a token, then paste it into an AI app that supports MCP (Claude Desktop, Claude Code,
          Cursor, VS Code, Gemini CLI…). The app can ask your map agent for places, reports and
          ideas, and prepare changes. Nothing changes until a proposal is confirmed. Each question
          counts toward your daily AI limit.
        </p>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate({ name });
          }}
        >
          <Input
            aria-label="Token name"
            value={name}
            maxLength={60}
            placeholder="What will it be used in? e.g. Claude Desktop"
            onChange={(event) => setName(event.target.value)}
          />
          <Button type="submit" disabled={name.trim().length === 0 || create.isPending}>
            {create.isPending && <Loader2 className="animate-spin" />} Make a token
          </Button>
        </form>
      </div>

      {fresh && (
        <div className="bg-surface grid gap-3 rounded-[1.2rem] border-2 p-4">
          <p className="text-sm font-semibold">Your token for {fresh.name}</p>
          <p className="text-fg-muted text-sm">Copy it now. It&apos;s only shown once.</p>
          <CopyBox label="Token" value={fresh.token} />
          <CopyBox label="Address" value={endpoint} />
          <CopyBox
            label="Claude Code"
            value={`claude mcp add --transport http bandcoin ${endpoint} --header "Authorization: Bearer ${fresh.token}"`}
          />
          <div>
            <Button variant="ghost" onClick={() => setFresh(null)}>
              I&apos;ve saved it
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-2">
        <h3 className="text-sm font-semibold">Your tokens</h3>
        {tokens.isPending ? (
          <Skeleton className="h-14 w-full rounded-xl" />
        ) : tokens.data?.length === 0 ? (
          <p className="text-fg-muted text-sm">None yet.</p>
        ) : (
          tokens.data?.map((token) => (
            <div
              key={token.id}
              className="bg-surface flex items-center gap-3 rounded-xl border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{token.name}</p>
                <p className="text-fg-muted text-xs">
                  <span className="font-mono">{token.prefix}…</span> · made {when(token.createdAt)}{" "}
                  · last used {when(token.lastUsedAt)}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate({ id: token.id })}
              >
                Revoke
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
