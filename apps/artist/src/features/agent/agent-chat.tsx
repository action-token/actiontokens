"use client";

import { formatDistanceToNow } from "date-fns";
import { ArrowUp, History, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@actiontokens/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@actiontokens/ui/components/dropdown-menu";
import { cn } from "@actiontokens/ui/lib/cn";
import { api } from "~/trpc/react";

import { useAgentMap } from "./agent-map";
import { MessageList } from "./message-list";
import { useAgentChat } from "./use-agent-chat";
import { useStored } from "./use-stored";

/**
 * The map assistant: a floating chat over the Pins map, working for the
 * signed-in artist (or, on Admin › All maps, for the artist the admin is acting as). Pair with <AgentMapLayer /> inside the map so its results
 * appear there.
 */
export function AgentChat() {
  const [openSaved, setOpenSaved] = useStored("bandcoin.agent.open");
  const open = openSaved === "1";
  const setOpen = (o: boolean) => setOpenSaved(o ? "1" : "0");

  const chat = useAgentChat();
  const overview = api.agent.overview.useQuery(undefined, {
    refetchOnWindowFocus: false,
    retry: false,
  });
  const { clear } = useAgentMap();
  // Leaving the page clears what the assistant put on the map.
  useEffect(() => clear, [clear]);

  // Not an artist: no assistant.
  if (overview.error?.data?.code === "FORBIDDEN") return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-primary font-hud text-primary-foreground absolute right-4 bottom-8 z-20 inline-flex items-center gap-2 rounded-full py-2.5 pr-4 pl-3 text-sm font-semibold shadow-lg transition-transform hover:scale-[1.03] active:scale-[0.98]"
      >
        <Sparkles className="size-4" />
        Ask the map
        {chat.working && (
          <span
            className="bg-primary-foreground size-2 animate-pulse rounded-full"
            aria-label="Working"
          />
        )}
      </button>
    );
  }

  const empty = chat.messages.length === 0 && !chat.working && !chat.pendingText && !chat.loading;

  return (
    <section
      className={cn(
        "bg-background fixed inset-0 z-40 flex flex-col",
        "lg:bg-card/95 lg:absolute lg:inset-auto lg:right-4 lg:bottom-4 lg:z-20 lg:h-[min(720px,calc(100%-6rem))] lg:w-[420px] lg:overflow-hidden lg:rounded-2xl lg:border lg:shadow-2xl",
      )}
      aria-label="Map assistant"
    >
      {/* Header */}
      <header className="flex items-center gap-2 border-b px-3 py-2.5">
        <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-hud truncate text-sm font-semibold">Map assistant</p>
          <p className="text-muted-foreground truncate text-[11px]">
            Asks first, changes nothing until you confirm
          </p>
        </div>
        <Conversations
          currentId={chat.conversationId}
          onOpen={chat.openConversation}
          onNew={chat.newChat}
          disabled={chat.working}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={chat.newChat}
          disabled={chat.working || empty}
          aria-label="New chat"
          title="New chat"
        >
          <Plus />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setOpen(false)}
          aria-label="Close assistant"
          title="Close"
        >
          <X />
        </Button>
      </header>

      {/* Conversation */}
      <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto">
        {empty ? (
          <Welcome
            suggestions={overview.data?.suggestions ?? []}
            onPick={(s) => void chat.send(s)}
            artistName={overview.data?.artist.name}
          />
        ) : (
          <MessageList chat={chat} linkable />
        )}
      </div>

      <Composer onSend={(t) => void chat.send(t)} busy={chat.working} />
    </section>
  );
}

function Welcome({
  suggestions,
  onPick,
  artistName,
}: {
  suggestions: string[];
  onPick: (s: string) => void;
  artistName?: string;
}) {
  return (
    <div className="flex h-full flex-col justify-end gap-4 px-4 py-6">
      <div>
        <p className="font-hud text-lg font-semibold">
          What should we do on the map{artistName ? `, ${artistName}` : ""}?
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          Find places and drop pins in bulk, tidy up your pins and hotspots, plan events and
          announcements, or see how fans collect. Nothing changes until you confirm.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="bg-card hover:border-primary/50 hover:bg-primary/5 border-foreground/10 rounded-[1.4rem] border-2 px-3 py-2 text-left text-sm transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function Composer({ onSend, busy }: { onSend: (text: string) => void; busy: boolean }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow with the text, up to a few lines.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  const submit = () => {
    if (!text.trim() || busy) return;
    onSend(text);
    setText("");
  };

  return (
    <form
      className="border-t p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="bg-card focus-within:border-primary/60 border-foreground/10 flex items-end gap-2 rounded-[1.4rem] border-2 px-3 py-2">
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder={busy ? "Working on it…" : "Ask anything about your map…"}
          className="placeholder:text-faint max-h-36 min-h-6 flex-1 resize-none bg-transparent text-sm outline-none"
          aria-label="Message the map assistant"
        />
        <Button
          type="submit"
          size="icon-sm"
          className="shrink-0 rounded-lg"
          disabled={busy || !text.trim()}
          aria-label="Send"
        >
          <ArrowUp />
        </Button>
      </div>
      <p className="text-faint mt-1 px-1 text-[10px]">Enter to send · Shift+Enter for a new line</p>
    </form>
  );
}

function Conversations({
  currentId,
  onOpen,
  onNew,
  disabled,
}: {
  currentId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const utils = api.useUtils();
  const list = api.agent.conversations.useQuery(undefined, { enabled: open });
  const remove = api.agent.deleteConversation.useMutation({
    // Keep the spinner until the list no longer shows the chat.
    onSuccess: async (_, v) => {
      await utils.agent.conversations.invalidate();
      if (v.id === currentId) onNew();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          aria-label="Past chats"
          title="Past chats"
        >
          <History />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Past chats</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {list.isPending ? (
          <p className="text-muted-foreground px-2 py-3 text-xs">Loading…</p>
        ) : !list.data?.length ? (
          <p className="text-muted-foreground px-2 py-3 text-xs">No chats yet.</p>
        ) : (
          <div className="max-h-80 scrollbar-thin overflow-y-auto">
            {list.data.map((c) => {
              const deleting = remove.isPending && remove.variables.id === c.id;
              return (
                <DropdownMenuItem
                  key={c.id}
                  disabled={deleting}
                  onSelect={() => onOpen(c.id)}
                  className={cn(
                    "group gap-2",
                    c.id === currentId && "bg-accent",
                    deleting && "opacity-60",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{c.title}</span>
                    <span className="text-muted-foreground block text-[11px]">
                      {formatDistanceToNow(new Date(c.updatedAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </span>
                  {deleting ? (
                    <Loader2
                      className="text-muted-foreground size-3.5 animate-spin"
                      aria-label="Deleting"
                    />
                  ) : (
                    <button
                      type="button"
                      disabled={remove.isPending}
                      className="text-muted-foreground hover:text-destructive rounded p-1 opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:pointer-events-none"
                      aria-label={`Delete “${c.title}”`}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        remove.mutate({ id: c.id });
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </DropdownMenuItem>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
