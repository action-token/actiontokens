"use client";

import { type FormEvent, useState } from "react";
import toast from "react-hot-toast";

import { isAppError } from "@bandcoin/errors";
import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { Label } from "@bandcoin/ui/components/label";
import { Textarea } from "@bandcoin/ui/components/textarea";
import { slugFromName, validateSlug } from "@bandcoin/utils/slug";

import { api } from "~/trpc/react";

/**
 * Step one: who you are as an artist. The page address follows the name until
 * you type your own. A rejected artist sees this again with their last answers.
 */
export function ApplyForm({ initial }: { initial?: { name: string; slug: string; bio: string | null } }) {
  const utils = api.useUtils();
  const apply = api.onboarding.submitApplication.useMutation({
    onSuccess: () => utils.portal.status.invalidate(),
    onError: (error) => toast.error(isAppError(error) || error instanceof Error ? error.message : "Couldn't send your application."),
  });
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [customSlug, setCustomSlug] = useState(Boolean(initial));
  const [bio, setBio] = useState(initial?.bio ?? "");

  const address = customSlug ? slug : slugFromName(name);
  const problem = address ? validateSlug(address) : null;
  const ready = name.trim().length >= 2 && address.length > 0 && !problem;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (ready) apply.mutate({ name, slug: address, bio: bio || undefined });
  }

  return (
    <form onSubmit={submit} className="bg-surface grid max-w-xl gap-5 rounded-xl border p-5 sm:p-6">
      <div className="grid gap-1.5">
        <Label htmlFor="artist-name">Artist or band name</Label>
        <Input id="artist-name" value={name} maxLength={60} autoComplete="off" onChange={(event) => setName(event.target.value)} />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="artist-slug">Page address</Label>
        <div className="flex items-center gap-2">
          <span className="text-fg-muted shrink-0 text-sm">bandcoin.io/</span>
          <Input
            id="artist-slug"
            value={address}
            maxLength={40}
            autoComplete="off"
            aria-invalid={Boolean(problem)}
            onChange={(event) => {
              setCustomSlug(true);
              setSlug(event.target.value.toLowerCase());
            }}
          />
        </div>
        {problem && <p role="alert" className="text-danger text-xs">{problem}</p>}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="artist-bio">A line about you (optional)</Label>
        <Textarea id="artist-bio" value={bio} maxLength={500} rows={3} onChange={(event) => setBio(event.target.value)} />
      </div>

      <Button type="submit" disabled={!ready || apply.isPending} className="justify-self-start">
        {apply.isPending ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}
