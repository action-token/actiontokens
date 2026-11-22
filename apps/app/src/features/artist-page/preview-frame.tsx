"use client";

import { useEffect, useState } from "react";

import { normalizeBlocks, type Block } from "@actiontokens/page/blocks";
import { PAGE_ACTION_MESSAGE, type PageAction } from "@actiontokens/page/editor";
import { DEFAULT_THEME, themeSchema, type PageTheme } from "@actiontokens/page/theme";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { ErrorState } from "@actiontokens/ui/patterns/error-state";

import { api } from "~/trpc/react";

import { PageRenderer } from "./page-renderer";

/** Who may drive the preview: the artist portal, and localhost in development. */
const PORTAL_ORIGIN = new URL(process.env.NEXT_PUBLIC_ORG_URL ?? "https://org.action-tokens.com")
  .origin;
const ALLOWED_ORIGINS =
  process.env.NODE_ENV === "production"
    ? [PORTAL_ORIGIN]
    : [PORTAL_ORIGIN, "http://localhost:3001"];

type Design = { blocks: Block[]; theme: PageTheme };

/**
 * The page builder's live preview: the real artist page with the artist's
 * draft. The editor sends every change as a message, so edits show at once
 * without saving first; clicking a block tells the editor which one to open.
 *
 *   in : { type: "actiontokens-page:design", blocks, theme } and { type: "actiontokens-page:select", uid }
 *   out: { type: "actiontokens-page:ready" }, { type: "actiontokens-page:select", uid } and
 *        { type: "actiontokens-page:action", action } (the block toolbar and the + buttons)
 */
export function PreviewFrame({ slug }: { slug: string }) {
  const artist = api.artist.bySlug.useQuery({ slug });
  const draft = api.artist.draftDesign.useQuery({ slug }, { retry: false });
  const [design, setDesign] = useState<Design | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!ALLOWED_ORIGINS.includes(event.origin)) return;
      const data = event.data as {
        type?: string;
        blocks?: unknown;
        theme?: unknown;
        uid?: unknown;
      } | null;
      if (data?.type === "actiontokens-page:design") {
        const theme = themeSchema.safeParse(data.theme);
        setDesign({
          blocks: normalizeBlocks(data.blocks),
          theme: theme.success ? theme.data : DEFAULT_THEME,
        });
      } else if (data?.type === "actiontokens-page:select") {
        setSelected(typeof data.uid === "string" ? data.uid : null);
      }
    };
    window.addEventListener("message", onMessage);
    // Tell the editor we are listening (the editor then sends its current design).
    const parent =
      ALLOWED_ORIGINS.find((origin) => document.referrer.startsWith(origin)) ?? PORTAL_ORIGIN;
    window.parent.postMessage({ type: "actiontokens-page:ready" }, parent);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (artist.isError || draft.isError) {
    return (
      <div className="p-6">
        <ErrorState
          message={
            draft.error?.data?.code === "FORBIDDEN" || draft.error?.data?.code === "UNAUTHORIZED"
              ? "Sign in as this organization to preview the page."
              : "Couldn't load the preview."
          }
        />
      </div>
    );
  }
  const shown = design ?? draft.data;
  if (!artist.data || !shown) return <Skeleton className="m-6 h-96 rounded-xl" />;

  const parent =
    ALLOWED_ORIGINS.find((origin) => document.referrer.startsWith(origin)) ?? PORTAL_ORIGIN;
  const select = (uid: string) => {
    setSelected(uid);
    window.parent.postMessage({ type: "actiontokens-page:select", uid }, parent);
  };
  const act = (action: PageAction) =>
    window.parent.postMessage({ type: PAGE_ACTION_MESSAGE, action }, parent);

  return (
    <PageRenderer
      blocks={shown.blocks}
      theme={shown.theme}
      artist={artist.data}
      editing
      selectedUid={selected}
      onSelect={select}
      onAction={act}
    />
  );
}
