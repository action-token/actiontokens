"use client";

import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@actiontokens/ui/components/button";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { cn } from "@actiontokens/ui/lib/cn";

import { api } from "~/trpc/react";

const PROBLEMS: Record<string, string> = {
  state_mismatch: "That sign-in didn't match this browser. Try connecting again.",
  denied: "Facebook didn't give us access. Connect again and allow it.",
  failed: "Couldn't finish signing in with Facebook. Try again in a moment.",
  not_set_up: "Facebook isn't switched on for Bandcoin yet.",
};

type Page = { id: string; name: string };

/**
 * Settings › Facebook: copy new posts from a Facebook page into Bandcoin. Sign
 * in with Facebook, pick the page, and each new post (text and photos) is
 * copied once. Disconnect any time; posts already copied stay.
 */
export function FacebookTab() {
  const params = useSearchParams();
  const utils = api.useUtils();
  const status = api.facebook.status.useQuery();
  const disconnect = api.facebook.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Disconnected. Posts already copied stay.");
      void utils.facebook.status.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const picking = params.get("facebook") === "pages";
  const problem = PROBLEMS[params.get("facebook") ?? ""];

  if (status.isPending) return <Skeleton className="h-24 w-full max-w-xl rounded-xl" />;
  if (!status.data)
    return <p className="text-fg-muted text-sm">Couldn&apos;t load this. Try again.</p>;
  const { configured, connected, pageName, connectedAt } = status.data;

  return (
    <div className="grid gap-4">
      {problem && (
        <p role="alert" className="bg-surface-2 rounded-xl p-3 text-sm">
          {problem}
        </p>
      )}
      {!configured ? (
        <p className="text-fg-muted text-sm">
          Facebook isn&apos;t switched on for Bandcoin yet. It will show here once it is.
        </p>
      ) : connected ? (
        <div className="bg-surface grid gap-3 rounded-[1.2rem] border-2 p-4">
          <p className="text-sm">
            Connected to <span className="font-semibold">{pageName}</span>
            {connectedAt && (
              <span className="text-fg-muted">
                {" "}
                since {new Date(connectedAt).toLocaleDateString("en-US")}
              </span>
            )}
          </p>
          <p className="text-fg-muted text-sm">
            New posts on that page are copied here with their photos, once each. They appear in your
            posts and in your fans&apos; feed, without collectible copies.
          </p>
          <div>
            <Button
              variant="outline"
              disabled={disconnect.isPending}
              onClick={() => disconnect.mutate()}
            >
              {disconnect.isPending && <Loader2 className="animate-spin" />} Disconnect
            </Button>
          </div>
        </div>
      ) : picking ? (
        <PagePicker onDone={() => void utils.facebook.status.invalidate()} />
      ) : (
        <div className="grid gap-3">
          <p className="text-fg-muted text-sm">
            Connect a Facebook page and each new post on it is copied into your Bandcoin posts, with
            its photos. Nothing is posted to Facebook.
          </p>
          <div>
            <Button asChild>
              <a href="/api/facebook/start?redirect=/settings%3Ftab%3Dfacebook">Connect Facebook</a>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function PagePicker({ onDone }: { onDone: () => void }) {
  const [pages, setPages] = useState<Page[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetch("/api/facebook/pages")
      .then((response) => response.json() as Promise<{ pages: Page[]; error?: string }>)
      .then((data) => {
        setPages(data.pages);
        setError(data.error ?? null);
        if (data.pages.length === 1) setChosen(data.pages[0]!.id);
      })
      .catch(() => setError("Couldn't read your pages."));
  }, []);

  async function connect() {
    if (!chosen) return;
    setSaving(true);
    const response = await fetch("/api/facebook/connect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pageId: chosen }),
    });
    const data = (await response.json()) as { error?: string };
    setSaving(false);
    if (!response.ok) return toast.error(data.error ?? "Couldn't connect that page.");
    toast.success("Connected. New posts on that page will be copied here.");
    window.history.replaceState(null, "", "/settings?tab=facebook");
    onDone();
  }

  if (pages === null && !error) return <Skeleton className="h-24 w-full rounded-xl" />;
  return (
    <div className="grid gap-3">
      <p className="text-sm font-semibold">Pick the page to copy posts from</p>
      {pages?.length === 0 && (
        <p className="text-fg-muted text-sm">
          {error ??
            "We didn't find a page you manage. Connect again and allow access to your page."}
        </p>
      )}
      <div role="radiogroup" aria-label="Facebook page" className="grid gap-2">
        {pages?.map((page) => (
          <button
            key={page.id}
            type="button"
            role="radio"
            aria-checked={chosen === page.id}
            onClick={() => setChosen(page.id)}
            className={cn(
              "rounded-xl border-2 p-3 text-left text-sm font-medium transition-colors",
              chosen === page.id ? "border-primary bg-primary-soft" : "hover:bg-surface-2",
            )}
          >
            {page.name}
          </button>
        ))}
      </div>
      <div>
        <Button disabled={!chosen || saving} onClick={() => void connect()}>
          {saving && <Loader2 className="animate-spin" />} Connect this page
        </Button>
      </div>
    </div>
  );
}
