"use client";

import { useEffect, useRef, useState } from "react";

import type { Block } from "@bandcoin/page/blocks";
import type { PageTheme } from "@bandcoin/page/theme";
import { cn } from "@bandcoin/ui/lib/cn";

import { FAN_APP_URL } from "../shell/links";

const APP_ORIGIN = new URL(FAN_APP_URL).origin;

/**
 * The real artist page, framed. Every change is sent to it as a message, so
 * edits show at once without saving; a click on a block in the preview selects
 * it here. (The fan app's /artist/[slug]/preview does the other half.)
 */
export function PreviewPane({
  slug,
  blocks,
  theme,
  selectedUid,
  onSelect,
  phone,
}: {
  slug: string;
  blocks: Block[];
  theme: PageTheme;
  selectedUid: string | null;
  onSelect: (uid: string) => void;
  phone: boolean;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [src] = useState(() => `${FAN_APP_URL}/artist/${slug}/preview`);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== APP_ORIGIN || event.source !== frame.current?.contentWindow) return;
      const data = event.data as { type?: string; uid?: unknown } | null;
      if (data?.type === "bandcoin-page:ready") setReady(true);
      if (data?.type === "bandcoin-page:select" && typeof data.uid === "string") onSelect(data.uid);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onSelect]);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(
      () =>
        frame.current?.contentWindow?.postMessage(
          { type: "bandcoin-page:design", blocks, theme },
          APP_ORIGIN,
        ),
      120,
    );
    return () => clearTimeout(timer);
  }, [ready, blocks, theme]);

  useEffect(() => {
    if (ready)
      frame.current?.contentWindow?.postMessage(
        { type: "bandcoin-page:select", uid: selectedUid },
        APP_ORIGIN,
      );
  }, [ready, selectedUid]);

  return (
    <div className="bg-surface-2 flex min-h-[520px] flex-1 justify-center overflow-auto p-3 lg:min-h-0">
      <div
        className={cn(
          "bg-background h-full min-h-[520px] overflow-hidden rounded-xl border shadow-lg transition-[width]",
          phone ? "w-[390px] max-w-full" : "w-full",
        )}
      >
        <iframe ref={frame} src={src} title="Page preview" className="size-full border-0" />
      </div>
    </div>
  );
}
