"use client";

import { formatDistanceToNow } from "date-fns";
import { Check, Copy, KeyRound, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { cn } from "@bandcoin/ui/lib/cn";
import { Field } from "@bandcoin/ui/patterns/form-page";

import { api } from "~/trpc/react";

import { appSetups } from "./ai-app-setups";

const copyText = (value: string, what: string) =>
  void navigator.clipboard.writeText(value).then(
    () => toast.success(`${what} copied`),
    () => toast.error(`Couldn't copy the ${what.toLowerCase()}`),
  );

/**
 * Settings › AI apps: tokens that let an AI app (Claude, Cursor, …) use the map
 * agent as you, through the portal's MCP server at /api/mcp. A token is shown
 * once, when it's made. The app can only ask questions and prepare changes;
 * nothing changes until a proposal is confirmed.
 */
export function AiAppsTab() {
  const utils = api.useUtils();
  const tokens = api.mcpTokens.list.useQuery();
  const [name, setName] = useState("");
  const [created, setCreated] = useState<{ name: string; token: string } | null>(null);

  const create = api.mcpTokens.create.useMutation({
    onSuccess: (row) => {
      setCreated({ name: row.name, token: row.token });
      setName("");
      void utils.mcpTokens.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const revoke = api.mcpTokens.revoke.useMutation({
    onSuccess: () => {
      toast.success("Token revoked. Apps using it stop working.");
      void utils.mcpTokens.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const endpoint = typeof window === "undefined" ? "/api/mcp" : `${window.location.origin}/api/mcp`;
  const shownToken = created?.token ?? "YOUR_TOKEN";

  return (
    <div className="bg-card border-foreground/10 space-y-6 rounded-[1.4rem] border-2 p-4 sm:p-5">
      <p className="text-muted-foreground text-sm">
        Use the map agent from an AI app such as Claude or Cursor. It can do everything the chat on
        the Pins map does, as you: find places and events, report on your pins, and prepare changes.
        Changes still need a confirmation before anything happens. Each question counts toward your
        daily AI limit.
      </p>

      <Field label="Server URL" action={<CopyButton value={endpoint} what="URL" />}>
        <code className="bg-muted block rounded-md px-3 py-2 text-sm break-all">{endpoint}</code>
      </Field>

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate({ name: name.trim() });
        }}
      >
        <div className="min-w-0 flex-1">
          <Field
            label="New token"
            htmlFor="mcp-token-name"
            hint="Name it after the app you'll use it in."
          >
            <Input
              id="mcp-token-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bandcoin MCP token"
              maxLength={60}
            />
          </Field>
        </div>
        <Button type="submit" disabled={!name.trim() || create.isPending} className="mb-6">
          {create.isPending ? <Loader2 className="animate-spin" /> : <KeyRound />} Create
        </Button>
      </form>

      {created && (
        <div className="border-primary/40 bg-primary/5 space-y-2 rounded-lg border p-3">
          <p className="text-sm font-semibold">
            Token “{created.name}” created. Copy it now: it won&rsquo;t be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="bg-background min-w-0 flex-1 rounded-md px-3 py-2 text-xs break-all">
              {created.token}
            </code>
            <CopyButton value={created.token} what="Token" />
          </div>
        </div>
      )}

      <ConnectApp endpoint={endpoint} token={shownToken} />

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Your tokens</h3>
        {tokens.isPending ? (
          <Loader2 className="text-muted-foreground size-4 animate-spin" />
        ) : !tokens.data?.length ? (
          <p className="text-muted-foreground text-sm">No tokens yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {tokens.data.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{t.name}</p>
                  <p className="text-muted-foreground text-xs">
                    <code>{t.prefix}…</code> · created{" "}
                    {formatDistanceToNow(new Date(t.createdAt), { addSuffix: true })} ·{" "}
                    {t.lastUsedAt
                      ? `used ${formatDistanceToNow(new Date(t.lastUsedAt), { addSuffix: true })}`
                      : "never used"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate({ id: t.id })}
                >
                  <Trash2 /> Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ConnectApp({ endpoint, token }: { endpoint: string; token: string }) {
  const setups = appSetups(endpoint, token);
  const [appId, setAppId] = useState(setups[0]!.id);
  const app = setups.find((a) => a.id === appId) ?? setups[0]!;
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Connect an app</h3>
      <div className="-mx-1 flex scrollbar-none gap-1.5 overflow-x-auto px-1" role="tablist">
        {setups.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={a.id === app.id}
            onClick={() => setAppId(a.id)}
            className={cn(
              "flex-none rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors",
              a.id === app.id
                ? "border-primary bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground border-foreground/15",
            )}
          >
            {a.label}
          </button>
        ))}
      </div>
      <Snippet title={app.where} code={app.code} />
      <p className="text-muted-foreground text-xs">
        ChatGPT and claude.ai web connectors need OAuth sign-in, which isn&rsquo;t available yet.
      </p>
    </div>
  );
}

function Snippet({ title, code }: { title: string; code: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-muted-foreground text-xs font-medium">{title}</p>
        <CopyButton value={code} what="Snippet" />
      </div>
      <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">{code}</pre>
    </div>
  );
}

function CopyButton({ value, what }: { value: string; what: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => {
        copyText(value, what);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check /> : <Copy />} Copy
    </Button>
  );
}
