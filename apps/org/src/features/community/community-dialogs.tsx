"use client";

import { Check, Search } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@actiontokens/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@actiontokens/ui/components/dialog";
import { Switch } from "@actiontokens/ui/components/switch";
import { cn } from "@actiontokens/ui/lib/cn";

import { api } from "~/trpc/react";

import { nameOf, PersonAvatar } from "./parts";

/** Invite people: search by name, username or email, tick them, send. */
export function InviteDialog({
  communityId,
  onClose,
}: {
  communityId: string;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => {
    const id = window.setTimeout(() => setSearch(typed.trim()), 300);
    return () => window.clearTimeout(id);
  }, [typed]);
  const people = api.community.searchUsers.useQuery({ communityId, search: search || undefined });
  const invite = api.community.invite.useMutation({
    onSuccess: (result) => {
      toast.success(result.invited === 1 ? "Invite sent." : `${result.invited} invites sent.`);
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });
  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite to the crew</DialogTitle>
          <DialogDescription>They get a notification with a link to join.</DialogDescription>
        </DialogHeader>
        <label className="cm-search">
          <Search className="size-4 shrink-0" />
          <input
            autoFocus
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="Name, @username or email"
            aria-label="Search people"
          />
        </label>
        <ul className="cm-pick">
          {(people.data ?? []).map((person) => {
            const on = picked.has(person.id);
            return (
              <li key={person.id}>
                <button
                  type="button"
                  onClick={() => toggle(person.id)}
                  aria-pressed={on}
                  className={cn(on && "cm-pick--on")}
                >
                  <PersonAvatar person={person} className="size-8" />
                  <span className="min-w-0 flex-1 truncate text-left">{nameOf(person)}</span>
                  <span className="cm-pick-box">{on && <Check className="size-3.5" />}</span>
                </button>
              </li>
            );
          })}
          {people.data?.length === 0 && (
            <li className="text-fg-faint p-3 text-sm">No one found.</li>
          )}
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={picked.size === 0 || invite.isPending}
            onClick={() => invite.mutate({ communityId, userIds: [...picked] })}
          >
            {invite.isPending ? "Sending…" : picked.size > 1 ? `Invite ${picked.size}` : "Invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const SWITCHES = [
  ["newPosts", "New posts", "When someone posts in the crew"],
  ["newComments", "Comments and replies", "On your posts and comments"],
  ["newMembers", "New members", "When someone joins (owners)"],
  ["reactions", "Likes", "When someone likes your post"],
] as const;

/** Which community notifications you get. */
export function NotifyDialog({
  communityId,
  onClose,
}: {
  communityId: string;
  onClose: () => void;
}) {
  const utils = api.useUtils();
  const settings = api.community.notifySettings.useQuery({ communityId });
  const save = api.community.setNotifySettings.useMutation({
    onSuccess: () => utils.community.notifySettings.invalidate({ communityId }),
    onError: (error) => toast.error(error.message),
  });
  const data = settings.data;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Notifications</DialogTitle>
          <DialogDescription>What this crew may tell you about.</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-1">
          {SWITCHES.map(([key, label, hint]) => (
            <li key={key} className="flex items-center justify-between gap-4 py-2">
              <span>
                <b className="block text-sm">{label}</b>
                <span className="text-fg-faint text-xs">{hint}</span>
              </span>
              <Switch
                checked={data?.[key] ?? true}
                disabled={!data || save.isPending}
                onCheckedChange={(checked) =>
                  data &&
                  save.mutate({
                    communityId,
                    newPosts: data.newPosts,
                    newComments: data.newComments,
                    newMembers: data.newMembers,
                    reactions: data.reactions,
                    [key]: checked,
                  })
                }
                aria-label={label}
              />
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
