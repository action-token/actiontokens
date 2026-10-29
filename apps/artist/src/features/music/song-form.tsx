"use client";

import { Loader2, Pause, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@bandcoin/ui/components/select";
import { Textarea } from "@bandcoin/ui/components/textarea";
import { assetCodeFrom, normalizeAssetCode, validateAssetCode } from "@bandcoin/utils/asset-code";
import { formatDuration, latestPreviewStart, PREVIEW_SECONDS } from "@bandcoin/utils/preview";

import { readAudioDuration } from "~/lib/audio";
import { api, type RouterOutputs } from "~/trpc/react";

import { FileField, type PickedFile } from "../catalog/file-field";
import { Field, Note, PriceFields, priceProblems, Toggle } from "../catalog/form-parts";
import { usePortal } from "../portal/use-portal";

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
  const saving = create.isPending || updateItem.isPending || updateSong.isPending;

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

  return (
    <form onSubmit={submit} className="bg-surface grid max-w-2xl gap-6 rounded-xl border p-5 sm:p-6">
      <Field label="Title" htmlFor="song-title">
        <Input id="song-title" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
      </Field>

      <Field label="Credited as" htmlFor="song-artist">
        <Input id="song-artist" value={artistName} maxLength={120} placeholder={portal.artist?.name ?? "Your artist name"} onChange={(event) => setArtistName(event.target.value)} />
        <Note>Leave it empty to use your artist name. Use it for features, like &ldquo;Luna Vale &amp; Kit&rdquo;.</Note>
      </Field>

      <Field label="Cover art" htmlFor="song-cover">
        <FileField id="song-cover" accept={IMAGE_TYPES} value={cover} onChange={setCover} preview hint="Square works best. JPG, PNG, WebP or GIF." />
      </Field>

      <Field label="The song" htmlFor="song-audio">
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
            onFile={(file) => void readAudioDuration(file).then((seconds) => {
              setDuration(seconds);
              setPreviewStart((current) => Math.min(current, latestPreviewStart(seconds)));
            })}
            hint="MP3, WAV, FLAC or M4A."
          />
        )}
        {audio && duration === 0 && !editing && <Note>Reading the length…</Note>}
        {duration > 0 && <Note>Length {formatDuration(duration)}</Note>}
      </Field>

      {audio && duration > 0 && (
        <PreviewPicker audioUrl={audio.url} duration={duration} start={previewStart} onStart={setPreviewStart} />
      )}

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

      <Field label="About the song (optional)" htmlFor="song-description">
        <Textarea id="song-description" value={description} maxLength={2000} rows={3} onChange={(event) => setDescription(event.target.value)} />
      </Field>

      <PriceFields bandcoin={priceBandcoin} usd={priceUsd} onBandcoin={setPriceBandcoin} onUsd={setPriceUsd} idPrefix="song-price" />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Copies" htmlFor="song-supply">
          <div className="flex items-center gap-2">
            <Toggle pressed={limited} disabled={locked} onClick={() => setLimited(true)}>
              Limited
            </Toggle>
            <Toggle pressed={!limited} disabled={locked} onClick={() => setLimited(false)}>
              Unlimited
            </Toggle>
            {limited && <Input id="song-supply" inputMode="numeric" value={supply} disabled={locked} aria-label="Number of copies" onChange={(event) => setSupply(event.target.value.replace(/\D/g, ""))} className="w-24" />}
          </div>
          {locked && <Note>{existing?.sold} sold, so the number of copies is fixed.</Note>}
        </Field>
        <Field label="Asset code" htmlFor="song-code" error={codeProblem}>
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
          <Note>{locked ? "Fixed after the first sale." : "The song's short name on Stellar, up to 12 letters and numbers."}</Note>
        </Field>
      </div>

      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" checked={publish} onChange={(event) => setPublish(event.target.checked)} className="size-4" />
        <span>
          <b>{publish ? "Published" : "Draft"}</b> <span className="text-fg-muted">· {publish ? "fans can buy and preview it" : "only you can see it"}</span>
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!ready || saving}>
          {saving && <Loader2 className="animate-spin" />}
          {editing ? "Save changes" : "Release song"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push(defaultAlbumId ? `/music/albums/${defaultAlbumId}` : "/music")}>
          Cancel
        </Button>
      </div>
    </form>
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
