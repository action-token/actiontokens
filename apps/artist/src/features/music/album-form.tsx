"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { Textarea } from "@bandcoin/ui/components/textarea";

import { api, type RouterOutputs } from "~/trpc/react";

import { FileField, type PickedFile } from "../catalog/file-field";
import { Field } from "../catalog/form-parts";

type Album = RouterOutputs["music"]["albums"][number];

const messageOf = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong.");

/** An album is a title, a cover and a description; songs join it from their own form. */
export function AlbumForm({ existing }: { existing?: Album }) {
  const router = useRouter();
  const utils = api.useUtils();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [cover, setCover] = useState<PickedFile | null>(existing ? { url: existing.coverUrl, name: "cover", mime: "image/jpeg" } : null);

  const done = (message: string, to: string) => {
    toast.success(message);
    void utils.music.albums.invalidate();
    router.push(to);
  };
  const create = api.music.createAlbum.useMutation({
    onSuccess: ({ albumId }) => done("Album created. Add its songs next.", `/music/albums/${albumId}`),
    onError: (error) => toast.error(messageOf(error)),
  });
  const update = api.music.updateAlbum.useMutation({ onSuccess: () => done("Saved", "/music?tab=albums"), onError: (error) => toast.error(messageOf(error)) });
  const saving = create.isPending || update.isPending;
  const ready = title.trim().length > 0 && cover !== null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || !cover) return;
    if (existing) update.mutate({ albumId: existing.id, title, description, coverUrl: cover.url });
    else create.mutate({ title, description: description || undefined, coverUrl: cover.url });
  }

  return (
    <form onSubmit={submit} className="bg-surface grid max-w-2xl gap-6 rounded-xl border p-5 sm:p-6">
      <Field label="Album title" htmlFor="album-title">
        <Input id="album-title" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
      </Field>
      <Field label="Cover art" htmlFor="album-cover">
        <FileField id="album-cover" accept="image/jpeg,image/png,image/webp,image/gif" value={cover} onChange={setCover} preview hint="Square works best." />
      </Field>
      <Field label="About the album (optional)" htmlFor="album-description">
        <Textarea id="album-description" value={description} maxLength={2000} rows={3} onChange={(event) => setDescription(event.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!ready || saving}>
          {saving && <Loader2 className="animate-spin" />}
          {existing ? "Save changes" : "Create album"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/music?tab=albums")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
