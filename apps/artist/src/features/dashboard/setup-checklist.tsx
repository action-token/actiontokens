"use client";

import { Check, Circle } from "lucide-react";
import Link from "next/link";

import { cn } from "@bandcoin/ui/lib/cn";

import { api } from "~/trpc/react";

/** The first things an approved artist does, ticked off as they happen. */
export function SetupChecklist() {
  const songs = api.music.songs.useQuery();
  const items = api.catalog.list.useQuery();
  const token = api.memberships.fanToken.useQuery();

  const steps = [
    { done: (songs.data?.length ?? 0) > 0, loading: songs.isPending, href: "/music/new", title: "Release your first song", text: "Upload it, pick the 30-second preview, set a price." },
    { done: token.data != null, loading: token.isPending, href: "/memberships", title: "Create your fan token", text: "Tiers count how much of it a fan holds." },
    { done: (items.data?.length ?? 0) > 0, loading: items.isPending, href: "/items/new", title: "Add a collectible", text: "Art, video, tickets or merch fans can own." },
  ];
  if (steps.every((step) => step.done)) return null;

  return (
    <section className="bg-surface grid max-w-2xl gap-1 rounded-xl border p-3 sm:p-4">
      <h2 className="display px-2 pt-1 text-lg">Get set up</h2>
      {steps.map((step) => (
        <Link key={step.href} href={step.href} className="hover:bg-surface-2 flex items-start gap-3 rounded-lg p-2 transition-colors">
          {step.done ? <Check className="text-success mt-0.5 size-5 shrink-0" strokeWidth={3} /> : <Circle className="text-fg-faint mt-0.5 size-5 shrink-0" />}
          <span className={cn("grid", step.loading && "opacity-60")}>
            <b className={cn("text-sm", step.done && "text-fg-muted line-through")}>{step.title}</b>
            <span className="text-fg-muted text-xs">{step.text}</span>
          </span>
        </Link>
      ))}
    </section>
  );
}
