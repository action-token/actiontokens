"use client";

import { cn } from "@bandcoin/ui/lib/cn";

import { api } from "~/trpc/react";

/** The artist's local wall-clock time and zone, so the AI picks sensible dates. */
export function localNow() {
  const d = new Date();
  const two = (n: number) => String(n).padStart(2, "0");
  return {
    now: `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

/** "12 AI uses left today"; hidden for admins (unlimited). */
export function AiQuota({ kind, className }: { kind: "text" | "image"; className?: string }) {
  const usage = api.ai.usage.useQuery(undefined, { staleTime: 30_000 });
  if (!usage.data || usage.data.unlimited) return null;
  const left = usage.data[kind] ?? 0;
  return (
    <span className={cn("num text-xs", left === 0 ? "text-danger" : "text-fg-muted", className)}>
      {left} {kind === "image" ? "image" : "AI"} {left === 1 ? "use" : "uses"} left today
    </span>
  );
}
