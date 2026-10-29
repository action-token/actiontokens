"use client";

import { Coins, Disc3, Eye, ImageIcon, Loader2, Pause, Play, Type } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@bandcoin/ui/components/select";
import { Textarea } from "@bandcoin/ui/components/textarea";
import { Field, FormPage, FormSection, OptionList, SwitchRow } from "@bandcoin/ui/patterns/form-page";
import { assetCodeFrom, normalizeAssetCode, validateAssetCode } from "@bandcoin/utils/asset-code";
import { formatDuration, latestPreviewStart, PREVIEW_SECONDS } from "@bandcoin/utils/preview";

import { DeleteCard } from "~/components/delete-card";
import { readAudioDuration } from "~/lib/audio";
import { api, type RouterOutputs } from "~/trpc/react";

import { AiFillCard } from "../ai/ai-fill-card";
import { AiImagePanel } from "../ai/ai-image-panel";
import { AiTextButton } from "../ai/ai-text-button";
import { FileField, type PickedFile } from "../catalog/file-field";
import { Note, PriceFields, priceProblems, Toggle } from "../catalog/form-parts";
import { usePortal } from "../portal/use-portal";
import { StemsPanel } from "./stems-panel";

type Existing = RouterOutputs["music"]["song"];

const IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/gif";
const NO_ALBUM = "none";
const messageOf = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong.");
/**
 * One form for releasing a song and for editing it. The audio can't be swapped
 * after release (people may already own that exact recording). Songs are classic
 * tokens: the code is their name on Stellar, and supply and code lock after the
 * first sale. Fans who don't own it hear 30 seconds from the preview point.
 */
export function SongForm({ existing, defaultAlbumId }: { existing?: Existing; defaultAlbumId?: string }) {
  const router = useRouter();
  const utils = api.useUtils();
  const portal = usePortal();
  const albums = api.music.albums.useQuery();
  const editing = Boolean(existing);
  const locked = existing?.locked ?? false;

  const [title, setTitle] = useState(existing?.title ?? "");
  const [artistName, setArtistName] = useState(existing?.artistName ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [cover, setCover] = useState<PickedFile | null>(existing ? { url: existing.coverUrl, name: "cover", mime: "image/jpeg" } : null);
  const [audio, setAudio] = useState<PickedFile | null>(existing?.audioUrl ? { url: existing.audioUrl, name: "Song", mime: "audio/mpeg" } : null);
  const [duration, setDuration] = useState(existing?.durationSec ?? 0);
  const [previewStart, setPreviewStart] = useState(existing?.previewStartSec ?? 0);
  const [albumId, setAlbumId] = useState(existing?.albumId ?? defaultAlbumId ?? NO_ALBUM);
  const [trackNumber, setTrackNumber] = useState(existing?.trackNumber?.toString() ?? "");
  const [code, setCode] = useState(existing?.code ?? "");
  const [customCode, setCustomCode] = useState(editing);
  const [limited, setLimited] = useState(existing ? existing.supply !== null : false);
  const [supply, setSupply] = useState(existing?.supply?.toString() ?? "100");
  const [priceBandcoin, setPriceBandcoin] = useState(existing?.priceBandcoin ?? "");
  const [priceUsd, setPriceUsd] = useState(existing?.priceUsd ?? "");
  const [publish, setPublish] = useState(existing ? existing.visibility === "PUBLIC" : true);
  const [imageBrief, setImageBrief] = useState("");

  const shownCode = customCode ? code : assetCodeFrom(title);
  const codeProblem = shownCode ? validateAssetCode(shownCode) : null;
  const prices = priceProblems(priceBandcoin, priceUsd);
  const supplyNumber = Number(supply);
  const supplyOk = !limited || (Number.isInteger(supplyNumber) && supplyNumber >= 1);
  const ready =
    title.trim().length > 0 &&
    cover !== null &&
    audio !== null &&
    duration > 0 &&
    shownCode.length > 0 && !codeProblem &&
    priceBandcoin !== "" && !prices.bandcoin &&
    priceUsd !== "" && !prices.usd &&
    supplyOk;

  const done = (message: string) => {
    toast.success(message);
    void utils.music.songs.invalidate();
    void utils.music.albums.invalidate();
    router.push(defaultAlbumId ? `/music/albums/${defaultAlbumId}` : "/music");
  };
  const create = api.music.createSong.useMutation({ onSuccess: () => done("Song released"), onError: (error) => toast.error(messageOf(error)) });
  const updateItem = api.catalog.update.useMutation();
  const updateSong = api.music.updateSong.useMutation();
  const remove = api.catalog.remove.useMutation({ onSuccess: () => done("Song deleted"), onError: (error) => toast.error(messageOf(error)) });
  const saving = create.isPending || updateItem.isPending || updateSong.isPending;
  const aiContext = { title, creditedAs: artistName, description };
  const imagePrompt = imageBrief || [title, description.slice(0, 400)].filter(Boolean).join(". ");
  const backHref = defaultAlbumId ? `/music/albums/${defaultAlbumId}` : "/music";

  async function save() {
    if (!existing || !cover) return;
    try {
      await updateItem.mutateAsync({
        itemId: existing.id,
        title,
        description,
        coverUrl: cover.url,
        priceBandcoin,
        priceUsd,
        visibility: publish ? "PUBLIC" : "DRAFT",
        ...(locked ? {} : { supply: limited ? supplyNumber : null, code: shownCode }),
      });
      await updateSong.mutateAsync({
        itemId: existing.id,
        albumId: albumId === NO_ALBUM ? null : albumId,
        trackNumber: trackNumber ? Number(trackNumber) : null,
        artistName: artistName.trim() || undefined,
        previewStartSec: previewStart,
      });
      done("Saved");
    } catch (error) {
      toast.error(messageOf(error));
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || !cover || !audio) return;
    if (existing) return void save();
    create.mutate({
      title,
      description: description || undefined,
      coverUrl: cover.url,
      audio: { url: audio.url, durationSec: duration },
      previewStartSec: previewStart,
      code: shownCode,
      supply: limited ? supplyNumber : null,
      priceBandcoin,
      priceUsd,
      visibility: publish ? "PUBLIC" : "DRAFT",
      albumId: albumId === NO_ALBUM ? undefined : albumId,
      trackNumber: trackNumber ? Number(trackNumber) : undefined,
      artistName: artistName.trim() || undefined,
    });
  }

  const actions = (
    <>
      <Button asChild type="button" variant="ghost">
        <Link href={backHref}>Cancel</Link>
      </Button>
      <Button type="submit" disabled={!ready || saving}>
        {saving && <Loader2 className="animate-spin" />}
        {editing ? "Save changes" : "Release song"}
      </Button>
    </>
  );

  return (
    <FormPage
      title={existing ? existing.title : "New song"}
      eyebrow="Catalog"
      description={existing ? undefined : "Upload the recording, choose where the 30-second preview starts, and set the price."}
      back={{ href: backHref, label: defaultAlbumId ? "Album" : "Music" }}
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
              <p className="text-primary-text text-xs font-semibold tracking-wide uppercase">Preview</p>
              <p className="display text-xl leading-snug">{title || "Untitled song"}</p>
              <p className="text-fg-muted text-sm">
                {artistName.trim() || portal.artist?.name || "Your artist name"}
                {duration > 0 ? ` · ${formatDuration(duration)}` : ""}
              </p>
              <p className="num text-sm">
                {priceBandcoin || "…"} BANDCOIN · ${priceUsd || "…"}
              </p>
            </div>
          </section>
          {existing && (
            <DeleteCard
              title="Delete this song"
              confirmTitle={`Delete ${existing.title}?`}
              description={existing.locked ? "This song has sales, so it can't be deleted. Unpublish it to hide it instead." : "It disappears from your page. This can't be undone."}
              busy={remove.isPending}
              onDelete={() => remove.mutate({ itemId: existing.id })}
            />
          )}
        </>
      }
    >
      {!editing && (
        <AiFillCard
          form="song"
          context={aiContext}
          examples={["A mellow acoustic ballad about leaving home", "An upbeat summer single featuring Kit"]}
          apply={(result) => {
            const before = { title, artistName, description, customCode, imageBrief };
            setTitle(result.title);
            setDescription(result.description);
            if (result.creditedName) setArtistName(result.creditedName);
            setCustomCode(false);
            setImageBrief(result.imagePrompt);
            return () => {
              setTitle(before.title);
              setArtistName(before.artistName);
              setDescription(before.description);
              setCustomCode(before.customCode);
              setImageBrief(before.imageBrief);
            };
          }}
        />
      )}

      <FormSection title="The song" icon={Type}>
        <Field label="Title" htmlFor="song-title" required action={<AiTextButton form="song" field="title" maxChars={120} value={title} context={aiContext} onChange={setTitle} />}>
          <Input id="song-title" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field label="Credited as" htmlFor="song-artist" hint={'Leave it empty to use your artist name. Use it for features, like "Luna Vale & Kit".'}>
          <Input id="song-artist" value={artistName} maxLength={120} placeholder={portal.artist?.name ?? "Your artist name"} onChange={(event) => setArtistName(event.target.value)} />
        </Field>
        <Field label="About the song" htmlFor="song-description" action={<AiTextButton form="song" field="description" maxChars={2000} value={description} context={aiContext} onChange={setDescription} />}>
          <Textarea id="song-description" value={description} maxLength={2000} rows={4} onChange={(event) => setDescription(event.target.value)} />
        </Field>
      </FormSection>

      <FormSection title="Cover and recording" icon={ImageIcon}>
        <Field label="Cover art" htmlFor="song-cover" required>
          <FileField id="song-cover" accept={IMAGE_TYPES} value={cover} onChange={setCover} preview hint="Square works best. JPG, PNG, WebP or GIF." />
          <AiImagePanel form="song" aspect="square" suggestedPrompt={imagePrompt} onImage={(url) => setCover({ url, name: "cover", mime: "image/png" })} />
        </Field>

        <Field label="The recording" htmlFor="song-audio" required={!editing}>
          {editing ? (
            <Note>The recording can&apos;t be replaced after release, because people may already own it. Release a new song instead.</Note>
          ) : (
            <FileField
              id="song-audio"
              accept="audio/*"
              value={audio}
              onChange={(file) => {
                setAudio(file);
                if (!file) setDuration(0);
              }}
              onFile={(file) =>
                void readAudioDuration(file).then((seconds) => {
                  setDuration(seconds);
                  setPreviewStart((current) => Math.min(current, latestPreviewStart(seconds)));
                })
              }
              hint="MP3, WAV, FLAC or M4A."
            />
          )}
          {audio && duration === 0 && !editing && <Note>Reading the length…</Note>}
          {duration > 0 && <Note>Length {formatDuration(duration)}</Note>}
        </Field>

        {audio && duration > 0 && <PreviewPicker audioUrl={audio.url} duration={duration} start={previewStart} onStart={setPreviewStart} />}
      </FormSection>

      <FormSection title="Album" icon={Disc3} description="Optional. Songs without an album are singles.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Album" htmlFor="song-album">
            <Select value={albumId} onValueChange={setAlbumId}>
              <SelectTrigger id="song-album" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ALBUM}>No album (a single)</SelectItem>
                {albums.data?.map((album) => (
                  <SelectItem key={album.id} value={album.id}>
                    {album.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Track number" htmlFor="song-track">
            <Input id="song-track" inputMode="numeric" value={trackNumber} disabled={albumId === NO_ALBUM} className="max-w-28" onChange={(event) => setTrackNumber(event.target.value.replace(/\D/g, "").slice(0, 3))} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Price and copies" icon={Coins}>
        <PriceFields bandcoin={priceBandcoin} usd={priceUsd} onBandcoin={setPriceBandcoin} onUsd={setPriceUsd} idPrefix="song-price" />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Copies" htmlFor="song-supply" hint={locked ? `${existing?.sold} sold, so the number of copies is fixed.` : undefined}>
            <div className="flex items-center gap-2">
              <Toggle pressed={limited} disabled={locked} onClick={() => setLimited(true)}>
                Limited
              </Toggle>
              <Toggle pressed={!limited} disabled={locked} onClick={() => setLimited(false)}>
                Unlimited
              </Toggle>
              {limited && <Input id="song-supply" inputMode="numeric" value={supply} disabled={locked} aria-label="Number of copies" onChange={(event) => setSupply(event.target.value.replace(/\D/g, ""))} className="w-24" />}
            </div>
          </Field>
          <Field label="Asset code" htmlFor="song-code" required error={codeProblem} hint={locked ? "Fixed after the first sale." : "The song's short name on Stellar, up to 12 letters and numbers."}>
            <Input
              id="song-code"
              value={shownCode}
              disabled={locked}
              maxLength={12}
              autoComplete="off"
              aria-invalid={Boolean(codeProblem)}
              onChange={(event) => {
                setCustomCode(true);
                setCode(normalizeAssetCode(event.target.value));
              }}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Visibility" icon={Eye}>
        <OptionList>
          <SwitchRow icon={Eye} title={publish ? "Published" : "Draft"} hint={publish ? "Fans can buy and preview it." : "Only you can see it."} checked={publish} onChange={setPublish} />
        </OptionList>
      </FormSection>

      {existing && <StemsPanel itemId={existing.id} />}
    </FormPage>
  );
}

/** Pick where the 30-second preview starts, and hear exactly what fans will hear. */
function PreviewPicker({ audioUrl, duration, start, onStart }: { audioUrl: string; duration: number; start: number; onStart: (seconds: number) => void }) {
  const player = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const latest = latestPreviewStart(duration);

  function toggle() {
    const audio = player.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      return;
    }
    audio.currentTime = start;
    void audio.play();
  }

  return (
    <Field label="Where the preview starts" htmlFor="song-preview">
      <div className="flex items-center gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={toggle}>
          {playing ? <Pause /> : <Play />} {playing ? "Stop" : "Hear it"}
        </Button>
        <input
          id="song-preview"
          type="range"
          min={0}
          max={latest}
          value={Math.min(start, latest)}
          disabled={latest === 0}
          onChange={(event) => onStart(Number(event.target.value))}
          className="accent-primary min-w-0 flex-1"
        />
        <span className="num w-12 text-right text-sm">{formatDuration(start)}</span>
      </div>
      <Note>Fans who don&apos;t own the song hear {PREVIEW_SECONDS} seconds from here.</Note>
      <audio
        ref={player}
        src={audioUrl}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(event) => {
          if (event.currentTarget.currentTime >= start + PREVIEW_SECONDS) event.currentTarget.pause();
        }}
      />
    </Field>
  );
}
