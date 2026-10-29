"use client";

import { Loader2, Music2, Plus, Trash2 } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { FormSection } from "@bandcoin/ui/patterns/form-page";
import { formatDuration } from "@bandcoin/utils/preview";

import { readAudioDuration } from "~/lib/audio";
import { api } from "~/trpc/react";

import { FileField, type PickedFile } from "../catalog/file-field";

const MAX_STEMS = 8;
/** Stems live inside the song's form: Enter confirms the field, it must not save the song. */
const keepInPlace = (event: KeyboardEvent<HTMLInputElement>) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  event.currentTarget.blur();
};
const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

/**
 * A song's stems: the separate parts (vocals, drums, bass…) owners can mix in the
 * player. Fans who don't own the song hear the first 30 seconds of each. WAV
 * keeps previews exact; MP3 works too.
 */
export function StemsPanel({ itemId }: { itemId: string }) {
  const utils = api.useUtils();
  const stems = api.music.stems.useQuery({ itemId });
  const refresh = () =>
    utils.music.stems.invalidate({ itemId }).then(() => utils.music.songs.invalidate());

  const [name, setName] = useState("");
  const [file, setFile] = useState<PickedFile | null>(null);
  const [duration, setDuration] = useState(0);
  const add = api.music.addStem.useMutation({
    onSuccess: () => {
      setName("");
      setFile(null);
      setDuration(0);
      toast.success("Stem added");
      void refresh();
    },
    onError: (error) => toast.error(messageOf(error)),
  });
  const remove = api.music.removeStem.useMutation({
    onSuccess: () => void refresh(),
    onError: (error) => toast.error(messageOf(error)),
  });
  const rename = api.music.updateStem.useMutation({
    onSuccess: () => void refresh(),
    onError: (error) => toast.error(messageOf(error)),
  });

  const count = stems.data?.length ?? 0;
  const ready = name.trim().length > 0 && file !== null && duration > 0;

  return (
    <FormSection
      title="Stems"
      icon={Music2}
      description="Upload the separate parts so owners can mix the song in the player. Everyone else hears 30 seconds of each part. Use one file per part, as long as the song."
    >
      {stems.isPending ? (
        <Skeleton className="h-16 w-full rounded-lg" />
      ) : count === 0 ? (
        <p className="text-fg-faint text-sm">No stems yet.</p>
      ) : (
        <ul className="divide-y">
          {stems.data?.map((stem) => (
            <li key={stem.id} className="flex items-center gap-3 py-2">
              <span
                className="size-3 shrink-0 rounded-full"
                style={{ backgroundColor: stem.color }}
                aria-hidden
              />
              <Input
                defaultValue={stem.name}
                maxLength={30}
                aria-label={`Name of ${stem.name}`}
                className="h-8 min-w-0 flex-1"
                onKeyDown={keepInPlace}
                onBlur={(event) => {
                  const next = event.target.value.trim();
                  if (next && next !== stem.name) rename.mutate({ stemId: stem.id, name: next });
                }}
              />
              <span className="text-fg-muted num w-12 text-right text-sm">
                {stem.durationSec ? formatDuration(stem.durationSec) : ""}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove ${stem.name}`}
                disabled={remove.isPending}
                onClick={() => remove.mutate({ stemId: stem.id })}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {count < MAX_STEMS ? (
        <div className="grid gap-3 border-t pt-4">
          <Input
            value={name}
            maxLength={30}
            placeholder="Stem name, for example Vocals"
            aria-label="Stem name"
            onKeyDown={keepInPlace}
            onChange={(event) => setName(event.target.value)}
          />
          <FileField
            id="stem-file"
            accept="audio/wav,audio/x-wav,audio/mpeg,.wav,.mp3"
            value={file}
            onChange={(next) => {
              setFile(next);
              if (!next) setDuration(0);
            }}
            onFile={(picked) => void readAudioDuration(picked).then(setDuration)}
            hint="WAV or MP3."
          />
          <Button
            type="button"
            className="justify-self-start"
            disabled={!ready || add.isPending}
            onClick={() =>
              file && add.mutate({ itemId, name, audio: { url: file.url, durationSec: duration } })
            }
          >
            {add.isPending ? <Loader2 className="animate-spin" /> : <Plus />} Add stem
          </Button>
        </div>
      ) : (
        <p className="text-fg-faint text-sm">That&apos;s the most a song can have ({MAX_STEMS}).</p>
      )}
    </FormSection>
  );
}
