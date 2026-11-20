"use client";

import { Disc3, ImageIcon, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@actiontokens/ui/components/button";
import { Input } from "@actiontokens/ui/components/input";
import { Textarea } from "@actiontokens/ui/components/textarea";
import { Field, FormPage, FormSection } from "@actiontokens/ui/patterns/form-page";
import { formatDuration } from "@actiontokens/utils/preview";

import { DeleteCard } from "~/components/delete-card";
import { api, type RouterOutputs } from "~/trpc/react";

import { AiFillCard } from "../ai/ai-fill-card";
import { AiImagePanel } from "../ai/ai-image-panel";
import { AiTextButton } from "../ai/ai-text-button";
import { FileField, type PickedFile } from "../catalog/file-field";

type Album = RouterOutputs["music"]["albums"][number];

const BACK = { href: "/music?tab=albums", label: "Albums" };
const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

/** An album is a title, a cover and a description; songs join it from their own form. */
export function AlbumForm({ existing }: { existing?: Album }) {
  const router = useRouter();
  const utils = api.useUtils();
  const songs = api.music.songs.useQuery(undefined, { enabled: Boolean(existing) });
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [cover, setCover] = useState<PickedFile | null>(
    existing ? { url: existing.coverUrl, name: "cover", mime: "image/jpeg" } : null,
  );
  const [imageBrief, setImageBrief] = useState("");

  const done = (message: string, to: string) => {
    toast.success(message);
    void utils.music.albums.invalidate();
    void utils.music.songs.invalidate();
    router.push(to);
  };
  const create = api.music.createAlbum.useMutation({
    onSuccess: ({ albumId }) =>
      done("Album created. Add its songs next.", `/music/albums/${albumId}`),
    onError: (error) => toast.error(messageOf(error)),
  });
  const update = api.music.updateAlbum.useMutation({
    onSuccess: () => done("Saved", BACK.href),
    onError: (error) => toast.error(messageOf(error)),
  });
  const remove = api.music.removeAlbum.useMutation({
    onSuccess: () => done("Album deleted. Its songs are still yours.", BACK.href),
    onError: (error) => toast.error(messageOf(error)),
  });
  const saving = create.isPending || update.isPending;
  const ready = title.trim().length > 0 && cover !== null;
  const aiContext = { title, description };
  const imagePrompt = imageBrief || [title, description.slice(0, 400)].filter(Boolean).join(". ");
  const inAlbum = (songs.data ?? [])
    .filter((song) => song.albumId === existing?.id)
    .sort((a, b) => (a.trackNumber ?? 999) - (b.trackNumber ?? 999));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || !cover) return;
    if (existing) update.mutate({ albumId: existing.id, title, description, coverUrl: cover.url });
    else create.mutate({ title, description: description || undefined, coverUrl: cover.url });
  }

  const actions = (
    <>
      <Button asChild type="button" variant="ghost">
        <Link href={BACK.href}>Cancel</Link>
      </Button>
      <Button type="submit" disabled={!ready || saving}>
        {saving && <Loader2 className="animate-spin" />}
        {existing ? "Save changes" : "Create album"}
      </Button>
    </>
  );

  return (
    <FormPage
      title={existing ? existing.title : "New album"}
      eyebrow="Catalog"
      description={existing ? undefined : "Give it a title and a cover. You add the songs next."}
      back={BACK}
      onSubmit={submit}
      actions={actions}
      aside={
        <>
          <section className="bg-surface border-fg/10 overflow-hidden rounded-[1.4rem] border-2">
            {cover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover.url} alt="" className="aspect-square w-full object-cover" />
            )}
            <div className="grid gap-2 p-5">
              <p className="text-primary-text text-xs font-semibold tracking-wide uppercase">
                Preview
              </p>
              <p className="display text-2xl leading-snug">{title || "Untitled album"}</p>
              {description && <p className="text-fg-muted line-clamp-4 text-sm">{description}</p>}
            </div>
          </section>
          {existing && (
            <DeleteCard
              title="Delete this album"
              confirmTitle={`Delete ${existing.title}?`}
              description="Only the album goes. Its songs stay and become singles."
              busy={remove.isPending}
              onDelete={() => remove.mutate({ albumId: existing.id })}
            />
          )}
        </>
      }
    >
      {!existing && (
        <AiFillCard
          form="album"
          context={aiContext}
          examples={[
            "My debut EP, six dreamy bedroom-pop tracks",
            "A live album recorded at the Hall last winter",
          ]}
          apply={(result) => {
            const before = { title, description, imageBrief };
            setTitle(result.title);
            setDescription(result.description);
            setImageBrief(result.imagePrompt);
            return () => {
              setTitle(before.title);
              setDescription(before.description);
              setImageBrief(before.imageBrief);
            };
          }}
        />
      )}

      <FormSection title="The album" icon={Disc3}>
        <Field
          label="Album title"
          htmlFor="album-title"
          required
          action={
            <AiTextButton
              form="album"
              field="title"
              maxChars={120}
              value={title}
              context={aiContext}
              onChange={setTitle}
            />
          }
        >
          <Input
            id="album-title"
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Field
          label="About the album"
          htmlFor="album-description"
          action={
            <AiTextButton
              form="album"
              field="description"
              maxChars={2000}
              value={description}
              context={aiContext}
              onChange={setDescription}
            />
          }
        >
          <Textarea
            id="album-description"
            value={description}
            maxLength={2000}
            rows={4}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection title="Cover art" icon={ImageIcon}>
        <FileField
          id="album-cover"
          accept="image/jpeg,image/png,image/webp,image/gif"
          value={cover}
          onChange={setCover}
          preview
          hint="Square works best."
        />
        <AiImagePanel
          form="album"
          aspect="square"
          suggestedPrompt={imagePrompt}
          onImage={(url) => setCover({ url, name: "cover", mime: "image/png" })}
        />
      </FormSection>

      {existing && (
        <FormSection
          title="Songs"
          icon={Disc3}
          description={
            inAlbum.length === 0
              ? "No songs yet. Add one here, or choose this album when you edit a song."
              : undefined
          }
        >
          <Button asChild size="sm" variant="secondary" className="justify-self-start">
            <Link href={`/music/new?album=${existing.id}`}>
              <Plus /> Add a song
            </Link>
          </Button>
          {inAlbum.length > 0 && (
            <ol className="divide-y">
              {inAlbum.map((song) => (
                <li key={song.id}>
                  <Link
                    href={`/music/${song.id}`}
                    className="hover:bg-surface-2 -mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 text-sm"
                  >
                    <span className="text-fg-faint num w-6 text-right">
                      {song.trackNumber ?? "–"}
                    </span>
                    <b className="min-w-0 flex-1 truncate">{song.title}</b>
                    <span className="text-fg-muted num">
                      {song.durationSec ? formatDuration(song.durationSec) : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </FormSection>
      )}
    </FormPage>
  );
}
