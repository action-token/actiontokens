"use client";

import { ArrowUpRight, Loader2, Lock, Rocket } from "lucide-react";

import { Button } from "@bandcoin/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@bandcoin/ui/components/popover";

import type { Mixer } from "./use-mixer";

type ArtistStatus = "PENDING" | "APPROVED" | "BANNED" | "REJECTED" | null;

/** What a locked Publish says, for each kind of account. */
export function publishLock(status: ArtistStatus) {
  if (status === "APPROVED") return null;
  if (status === "PENDING")
    return {
      title: "Your artist page is in review",
      text: "You can publish to Bandcoin as soon as it's approved. Keep mixing meanwhile.",
      action: "Open the artist portal",
    };
  if (status === "REJECTED" || status === "BANNED")
    return {
      title: "Your artist page isn't approved",
      text: "Publishing to Bandcoin is for approved artists. The portal says what to do next.",
      action: "Open the artist portal",
    };
  return {
    title: "Publishing is for artists",
    text: "Anyone can mix and export a WAV. To put your song on Bandcoin, open your artist page.",
    action: "Join as Artist",
  };
}

/**
 * "Publish to Bandcoin": approved artists render the mix and its stems into
 * the portal's new-song form; everyone else sees it locked, with the way in.
 */
export function PublishButton({
  mixer,
  status,
  artistUrl,
}: {
  mixer: Mixer;
  status: ArtistStatus;
  artistUrl: string;
}) {
  const lock = publishLock(status);
  if (!lock)
    return (
      <Button
        variant="outline"
        disabled={mixer.empty || mixer.publishing !== null}
        onClick={() => mixer.publish(artistUrl)}
        title="Render the mix and its stems and open the portal's new-song form"
      >
        {mixer.publishing ? <Loader2 className="animate-spin" /> : <Rocket />}
        {mixer.publishing ?? "Publish"}
      </Button>
    );
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="text-fg-muted" title="Publishing is for artists">
          <Lock /> Publish
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-72 gap-3 p-4">
        <span className="bg-surface-2 grid size-10 place-items-center rounded-xl">
          <Lock className="text-primary-text size-5" />
        </span>
        <div className="grid gap-1">
          <p className="font-bold">{lock.title}</p>
          <p className="text-fg-muted text-sm">{lock.text}</p>
        </div>
        <Button asChild>
          <a href={artistUrl} target="_blank" rel="noreferrer">
            {lock.action} <ArrowUpRight />
          </a>
        </Button>
      </PopoverContent>
    </Popover>
  );
}
