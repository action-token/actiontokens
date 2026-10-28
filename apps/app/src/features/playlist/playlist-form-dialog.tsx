"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@bandcoin/ui/components/dialog";
import { Input } from "@bandcoin/ui/components/input";
import { Label } from "@bandcoin/ui/components/label";
import { Switch } from "@bandcoin/ui/components/switch";
import { Textarea } from "@bandcoin/ui/components/textarea";

import { api } from "~/trpc/react";

type Existing = { id: string; name: string; description: string | null; isPublic: boolean };

/**
 * Create a playlist (optionally with a first song), or edit one. A new
 * playlist opens straight away unless it was made from "Add to playlist".
 */
export function PlaylistFormDialog({
  open,
  onOpenChange,
  playlist,
  firstItemId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playlist?: Existing;
  firstItemId?: string;
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const [name, setName] = useState(playlist?.name ?? "");
  const [description, setDescription] = useState(playlist?.description ?? "");
  const [isPublic, setIsPublic] = useState(playlist?.isPublic ?? true);

  const done = async () => {
    await Promise.all([utils.playlist.invalidate(), utils.profile.invalidate()]);
    onOpenChange(false);
  };
  const create = api.playlist.create.useMutation({
    onSuccess: async (created) => {
      await done();
      if (firstItemId) toast.success(`Added to ${created.name}`);
      else router.push(`/playlist/${created.id}`);
    },
    onError: (error) => toast.error(error.message),
  });
  const update = api.playlist.update.useMutation({
    onSuccess: async () => {
      await done();
      router.refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const busy = create.isPending || update.isPending;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const fields = { name, description: description.trim() || undefined, isPublic };
    if (playlist) update.mutate({ playlistId: playlist.id, ...fields, description: description.trim() || null });
    else create.mutate({ ...fields, itemId: firstItemId });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle className="display text-2xl">{playlist ? "Edit playlist" : "New playlist"}</DialogTitle>
            <DialogDescription className="marker text-base">
              {playlist ? "*rename it or change who can see it*" : "*any song can go in; songs you own play in full*"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="playlist-name">Name</Label>
            <Input id="playlist-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="playlist-description">Description</Label>
            <Textarea
              id="playlist-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={300}
              rows={3}
              placeholder="Optional"
            />
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              <b className="block font-semibold">Public</b>
              <span className="text-fg-muted">Shown on your profile, anyone with the link can listen.</span>
            </span>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {playlist ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
