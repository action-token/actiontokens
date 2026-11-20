"use client";

import { useState } from "react";
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
import { Input } from "@actiontokens/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@actiontokens/ui/components/select";
import { Field } from "@actiontokens/ui/patterns/form-page";

import { api, type RouterOutputs } from "~/trpc/react";

import { WHO } from "./new-story-view";

type Story = RouterOutputs["stories"]["stories"][number];

/**
 * Change a story's caption and who can watch it, live or ended. The photo or
 * clip itself can't be swapped: share a new story instead.
 */
export function EditStoryDialog({ story, onClose }: { story: Story | null; onClose: () => void }) {
  return (
    <Dialog open={story !== null} onOpenChange={(next) => !next && onClose()}>
      {story && <EditForm key={story.id} story={story} onClose={onClose} />}
    </Dialog>
  );
}

function EditForm({ story, onClose }: { story: Story; onClose: () => void }) {
  const utils = api.useUtils();
  const tiers = api.memberships.tiers.useQuery();
  const activeTiers = tiers.data?.filter((tier) => tier.isActive) ?? [];
  const [caption, setCaption] = useState(story.caption ?? "");
  const [audience, setAudience] = useState(story.audience);
  const [tierId, setTierId] = useState(story.tierId ?? "");
  const save = api.stories.updateStory.useMutation({
    onSuccess: () => {
      toast.success("Story updated");
      void utils.stories.invalidate();
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  const changed =
    caption.trim() !== (story.caption ?? "") ||
    audience !== story.audience ||
    (audience === "MEMBERS" && tierId !== (story.tierId ?? ""));
  const ready = changed && (audience !== "MEMBERS" || tierId !== "");

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Edit story</DialogTitle>
        <DialogDescription>
          Change the caption or who can watch it. The photo or clip stays as it is.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <Field label="Caption">
          <Input
            aria-label="Caption"
            value={caption}
            maxLength={200}
            onChange={(event) => setCaption(event.target.value)}
            placeholder="Optional"
          />
        </Field>
        <Field label="Who can watch" hint={WHO.find((option) => option.value === audience)?.hint}>
          <Select value={audience} onValueChange={(value) => setAudience(value as typeof audience)}>
            <SelectTrigger aria-label="Who can watch">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WHO.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {audience === "MEMBERS" && (
          <Field
            label="Which tier"
            hint={
              activeTiers.length === 0 && !tiers.isPending
                ? "Create a membership tier first."
                : undefined
            }
          >
            <Select value={tierId} onValueChange={setTierId}>
              <SelectTrigger aria-label="Which tier">
                <SelectValue placeholder="Pick a tier" />
              </SelectTrigger>
              <SelectContent>
                {activeTiers.map((tier) => (
                  <SelectItem key={tier.id} value={tier.id}>
                    {tier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
        <Button
          disabled={!ready || save.isPending}
          onClick={() =>
            save.mutate({
              storyId: story.id,
              caption: caption.trim() || null,
              audience,
              tierId: audience === "MEMBERS" ? tierId : null,
            })
          }
        >
          Save
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
