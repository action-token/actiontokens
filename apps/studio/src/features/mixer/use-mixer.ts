"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

import { declare, putToStorage } from "~/lib/upload";
import { api } from "~/trpc/react";

import { isAudioName, isZip, MAX_ZIP_BYTES, unzipAudio } from "./audio-files";
import { MixEngine } from "./engine";
import { canRedo, canUndo, history, type History, record, redo, undo } from "./history";
import {
  audible,
  clipEnd,
  duplicateClip,
  emptyProject,
  MAX_CLIPS,
  MAX_TRACKS,
  mixLength,
  type MixClip,
  type MixEq,
  type MixProject,
  type MixTrack,
  moveTo,
  newTrack,
  normalizeProject,
  setFade,
  snapTime,
  splitClip,
  trim,
} from "./mix";

/** A song in the portal holds up to this many stems. */
const MAX_STEMS = 8;

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

export type OpenProject = { projectId: string | null; name: string; data: unknown };
export type Selection = { trackId: string; clipId: string } | null;
export type Pending = {
  id: string;
  name: string;
  stage: "Waiting" | "Unzipping" | "Checking" | "Uploading" | "Loading";
};
type TrackPatch = Partial<Pick<MixTrack, "volume" | "pan" | "muted" | "soloed" | "name">>;

/** Typing in a field keeps its keys: no shortcuts there. */
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/**
 * Everything the mixer does, in one place: the project (tracks and their
 * clips) with undo and redo, the selected clip, playback (play, pause, stop,
 * seek, loop, with a moving playhead), adding audio (uploads and Lyria runs),
 * editing (move, trim, split, duplicate, delete, fades, volume, pan; snapped to
 * beats unless you hold Alt), keyboard shortcuts, exporting a WAV, saving and
 * publishing.
 */
export function useMixer() {
  const engine = useRef<MixEngine | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [name, setName] = useState("Untitled mix");
  const [edits, setEdits] = useState<History<MixProject>>(() => history(emptyProject()));
  const project = edits.present;
  const [selected, setSelected] = useState<Selection>(null);
  const [dirty, setDirty] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [loop, setLoop] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);
  /** The portal form for the last publish, when the browser blocked opening it */
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const utils = api.useUtils();
  const sign = api.projects.upload.useMutation();
  const save = api.projects.save.useMutation({
    onSuccess: (result) => {
      setProjectId(result.projectId);
      setDirty(false);
      toast.success("Saved to your projects");
      void utils.projects.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const sound = () => (engine.current ??= new MixEngine());
  useEffect(() => () => engine.current?.close(), []);

  /**
   * One edit. Edits sharing a `merge` key in a row (a slider being dragged)
   * are one undo step.
   */
  const lastMerge = useRef<string | null>(null);
  const change = useCallback((next: (current: MixProject) => MixProject, merge?: string) => {
    setEdits((current) => {
      const value = next(current.present);
      if (value === current.present) return current;
      if (merge && lastMerge.current === merge) return { ...current, present: value };
      return record(current, value);
    });
    lastMerge.current = merge ?? null;
    setDirty(true);
  }, []);

  // The playhead follows the sound; at the end it loops or stops.
  const loopRef = useRef(loop);
  loopRef.current = loop;
  const projectRef = useRef(project);
  projectRef.current = project;
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const at = engine.current?.position();
      if (at !== null && at !== undefined) setTime(at);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  async function play(from = time) {
    const current = projectRef.current;
    if (mixLength(current.tracks) === 0) return;
    const start = from >= mixLength(current.tracks) ? 0 : from;
    try {
      const master = { volume: current.masterVolume, eq: current.masterEq };
      await sound().play(current.tracks, start, master, () => {
        if (loopRef.current) return void play(0);
        setPlaying(false);
        setTime(0);
      });
      setTime(start);
      setPlaying(true);
    } catch (error) {
      toast.error(messageOf(error));
    }
  }

  function pause() {
    const at = engine.current?.position();
    engine.current?.stop();
    setPlaying(false);
    if (at !== null && at !== undefined) setTime(at);
  }

  function stop() {
    engine.current?.stop();
    setPlaying(false);
    setTime(0);
  }

  function seek(to: number, free = false) {
    const at = snapTime(to, projectRef.current.bpm, projectRef.current.snap && !free);
    setTime(at);
    if (playing) void play(at);
  }

  /** Files on their way in, shown as loading tracks until they land. */
  const [pending, setPending] = useState<Pending[]>([]);
  const stage = (id: string, next: Pending["stage"] | null, name?: string) =>
    setPending((current) =>
      next === null
        ? current.filter((entry) => entry.id !== id)
        : current.some((entry) => entry.id === id)
          ? current.map((entry) => (entry.id === id ? { ...entry, stage: next } : entry))
          : [...current, { id, name: name ?? "Audio", stage: next }],
    );
  const pendingId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  /** A new track for decoded audio already in storage. */
  function addTrack(name: string, url: string, duration: number) {
    change((current) => ({
      ...current,
      tracks: [...current.tracks, newTrack({ name, url, duration }, current.tracks.length)],
    }));
  }

  /** Adds an audio file already in storage (a Lyria run) as a new track. */
  async function addAudio(input: { name: string; url: string }) {
    if (projectRef.current.tracks.length >= MAX_TRACKS)
      return void toast.error(`A project holds up to ${MAX_TRACKS} tracks.`);
    const id = pendingId();
    stage(id, "Loading", input.name);
    try {
      const buffer = await sound().load(input.url);
      addTrack(input.name, input.url, buffer.duration);
    } catch (error) {
      toast.error(`${input.name}: ${messageOf(error)}`);
    } finally {
      stage(id, null);
    }
  }

  /**
   * Files from your device: zips are unpacked (their audio only), each file is
   * opened here first so only audio this browser can play is uploaded, then
   * it's uploaded and added as a track. Every file shows as loading meanwhile.
   */
  async function uploadFiles(files: File[]) {
    const queue: { id: string; file: File }[] = [];
    const queued = (file: File) => {
      const id = pendingId();
      stage(id, "Waiting", file.name);
      queue.push({ id, file });
    };
    for (const file of files) {
      if (!isZip(file)) {
        if (!isAudioName(file.name) && !file.type.startsWith("audio/"))
          toast.error(`${file.name} isn't audio.`);
        else queued(file);
        continue;
      }
      if (file.size > MAX_ZIP_BYTES) {
        toast.error(`${file.name} is too big to unpack here: keep zips under 500 MB.`);
        continue;
      }
      const id = pendingId();
      stage(id, "Unzipping", file.name);
      try {
        const inside = await unzipAudio(file);
        if (inside.length === 0) toast.error(`${file.name} has no audio in it.`);
        inside.forEach(queued);
      } catch {
        toast.error(`${file.name} couldn't be unpacked. Is it a zip?`);
      } finally {
        stage(id, null);
      }
    }
    for (const { id, file } of queue) {
      const name = file.name.replace(/\.[^.]+$/, "");
      try {
        if (projectRef.current.tracks.length >= MAX_TRACKS) {
          toast.error(`A project holds up to ${MAX_TRACKS} tracks: ${file.name} wasn't added.`);
          continue;
        }
        stage(id, "Checking");
        const buffer = await sound().decodeFile(file);
        if (!buffer) {
          toast.error(`${file.name}: this browser can't open that format. Try MP3, WAV or FLAC.`);
          continue;
        }
        stage(id, "Uploading");
        const declared = await declare(file);
        const signed = await sign.mutateAsync(declared);
        await putToStorage(file, signed, declared.checksum);
        sound().remember(signed.fileUrl, buffer);
        addTrack(name, signed.fileUrl, buffer.duration);
      } catch (error) {
        toast.error(`${file.name}: ${messageOf(error)}`);
      } finally {
        stage(id, null);
      }
    }
  }

  const editTrack = (trackId: string, apply: (track: MixTrack) => MixTrack, merge?: string) =>
    change(
      (current) => ({
        ...current,
        tracks: current.tracks.map((track) => (track.id === trackId ? apply(track) : track)),
      }),
      merge,
    );

  const editClip = (trackId: string, clipId: string, apply: (clip: MixClip) => MixClip) =>
    editTrack(trackId, (track) => ({
      ...track,
      clips: track.clips.map((clip) => (clip.id === clipId ? apply(clip) : clip)),
    }));

  const snapped = (seconds: number, free: boolean) =>
    snapTime(seconds, project.bpm, project.snap && !free);

  /** The selected clip, if it still exists. */
  function selectedClip() {
    if (!selected) return null;
    const track = project.tracks.find((entry) => entry.id === selected.trackId);
    const clip = track?.clips.find((entry) => entry.id === selected.clipId);
    return track && clip ? { track, clip } : null;
  }

  /** Cuts the selected clip at the playhead, or every clip under it when none is selected. */
  function split() {
    const at = time;
    const only = selectedClip();
    let cut = 0;
    let right: Selection = null;
    const current = projectRef.current;
    const tracks = current.tracks.map((track) => {
      if (only && track.id !== only.track.id) return track;
      if (track.clips.length >= MAX_CLIPS) return track;
      let changed = false;
      const clips = track.clips.flatMap((clip) => {
        if (only && clip.id !== only.clip.id) return [clip];
        const parts = splitClip(clip, at);
        if (!parts) return [clip];
        cut += 1;
        changed = true;
        right = { trackId: track.id, clipId: parts[1].id };
        return parts;
      });
      return changed ? { ...track, clips } : track;
    });
    if (cut === 0) return void toast.error("Move the playhead inside a clip to split it.");
    change(() => ({ ...current, tracks }));
    if (only) setSelected(right);
  }

  function duplicate() {
    const found = selectedClip();
    if (!found) return void toast.error("Select a clip to duplicate.");
    if (found.track.clips.length >= MAX_CLIPS)
      return void toast.error(`A track holds up to ${MAX_CLIPS} clips.`);
    const copy = duplicateClip(found.clip);
    editTrack(found.track.id, (track) => ({ ...track, clips: [...track.clips, copy] }));
    setSelected({ trackId: found.track.id, clipId: copy.id });
  }

  function deleteClip() {
    const found = selectedClip();
    if (!found) return;
    editTrack(found.track.id, (track) => ({
      ...track,
      clips: track.clips.filter((clip) => clip.id !== found.clip.id),
    }));
    setSelected(null);
  }

  function stepBack() {
    lastMerge.current = null;
    setEdits((current) => undo(current));
    setDirty(true);
  }

  function stepForward() {
    lastMerge.current = null;
    setEdits((current) => redo(current));
    setDirty(true);
  }

  async function exportWav() {
    setExporting(true);
    try {
      const blob = await sound().exportWav(project.tracks, {
        volume: project.masterVolume,
        eq: project.masterEq,
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${name.trim() || "bandcoin-mix"}.wav`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setExporting(false);
    }
  }

  /** Uploads a rendered file and gives back its address in storage. */
  async function uploadBlob(blob: Blob, fileName: string) {
    const file = new File([blob], fileName, { type: blob.type });
    const declared = await declare(file);
    const signed = await sign.mutateAsync(declared);
    await putToStorage(file, signed, declared.checksum);
    return signed.fileUrl;
  }

  /**
   * "Publish as a song": renders the mix and each heard track lined up with it
   * (the song's stems), uploads them, saves the project with them and opens the
   * artist portal's new-song form, which fills itself in from the project.
   */
  async function publish(artistPortal: string) {
    const heard = audible(project.tracks).filter((track) => track.clips.length > 0);
    if (heard.length === 0) return void toast.error("Add a track first.");
    if (heard.length > MAX_STEMS)
      return void toast.error(
        `A song holds up to ${MAX_STEMS} stems. Mute or remove tracks so ${MAX_STEMS} or fewer play.`,
      );
    stop();
    setPublishedUrl(null);
    // Opened now, while it's still the click: browsers block windows opened later.
    const tab = window.open("about:blank", "_blank");
    const length = mixLength(heard);
    const durationSec = Math.max(1, Math.ceil(length));
    const base = name.trim() || "bandcoin-mix";
    try {
      setPublishing("Rendering the mix…");
      const mixUrl = await uploadBlob(
        await sound().exportWav(project.tracks, {
          volume: project.masterVolume,
          eq: project.masterEq,
        }),
        `${base}.wav`,
      );
      const stems = [];
      for (const [index, track] of heard.entries()) {
        setPublishing(`Rendering stems (${index + 1} of ${heard.length})…`);
        const url = await uploadBlob(
          await sound().stemWav(track, length),
          `${base}-${index + 1}.wav`,
        );
        stems.push({ name: track.name.slice(0, 30), url, durationSec });
      }
      setPublishing("Saving…");
      const saved = await save.mutateAsync({
        projectId,
        name,
        data: { ...project, publish: { audio: { url: mixUrl, durationSec }, stems } },
      });
      const url = `${artistPortal}/music/new?studio=${saved.projectId}`;
      if (tab) {
        tab.location.href = url;
        toast.success("The new-song form is open in the artist portal");
      } else {
        setPublishedUrl(url);
        toast.success("Ready: open the new-song form below");
      }
    } catch (error) {
      tab?.close();
      toast.error(messageOf(error));
    } finally {
      setPublishing(null);
    }
  }

  function open(next: OpenProject) {
    stop();
    setProjectId(next.projectId);
    setName(next.name);
    lastMerge.current = null;
    setEdits(history(normalizeProject(next.data)));
    setSelected(null);
    setDirty(false);
  }

  // Keyboard: Space plays, S splits, Cmd/Ctrl+D duplicates, Delete removes the
  // clip, Cmd/Ctrl+Z undoes (with Shift, redoes), Escape clears the selection.
  const keys = useRef<(event: KeyboardEvent) => void>(() => undefined);
  keys.current = (event) => {
    if (typing(event.target)) return;
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (key === " ") {
      event.preventDefault();
      return void (playing ? pause() : play());
    }
    if (mod && key === "z") {
      event.preventDefault();
      return event.shiftKey ? stepForward() : stepBack();
    }
    if (mod && key === "y") {
      event.preventDefault();
      return stepForward();
    }
    if (mod && key === "d") {
      event.preventDefault();
      return duplicate();
    }
    if (mod) return;
    if (key === "s") return split();
    if (key === "delete" || key === "backspace") {
      if (selectedClip()) event.preventDefault();
      return deleteClip();
    }
    if (key === "escape") setSelected(null);
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => keys.current(event);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const length = mixLength(project.tracks);
  return {
    projectId,
    name,
    setName: (value: string) => {
      setName(value);
      setDirty(true);
    },
    project,
    /** Nothing on the timeline and nothing on its way */
    empty: project.tracks.length === 0 && pending.length === 0,
    pending,
    dirty,
    playing,
    time,
    loop,
    setLoop,
    zoom,
    setZoom,
    adding: pending.length > 0,
    exporting,
    saving: save.isPending,
    length,
    selected,
    select: setSelected,
    canUndo: canUndo(edits),
    canRedo: canRedo(edits),
    undo: stepBack,
    redo: stepForward,
    play: () => void play(),
    pause,
    stop,
    seek,
    addAudio: (input: { name: string; url: string }) => void addAudio(input),
    uploadFiles: (files: File[]) => void uploadFiles(files),
    move: (trackId: string, clipId: string, startTime: number, free = false) =>
      editClip(trackId, clipId, (clip) => moveTo(clip, snapped(startTime, free))),
    trim: (trackId: string, clipId: string, edge: "start" | "end", delta: number, free = false) =>
      editClip(trackId, clipId, (clip) => {
        // The edge lands on a beat: work out the delta that puts it there.
        const edgeAt = edge === "start" ? clip.startTime : clipEnd(clip);
        return trim(clip, edge, snapped(edgeAt + delta, free) - edgeAt);
      }),
    fade: (trackId: string, clipId: string, edge: "in" | "out", seconds: number) =>
      editClip(trackId, clipId, (clip) => setFade(clip, edge, seconds)),
    split,
    duplicate,
    deleteClip,
    canSplit:
      selectedClip() !== null ||
      project.tracks.some((track) => track.clips.some((clip) => splitClip(clip, time))),
    updateTrack: (trackId: string, patch: TrackPatch, merge?: string) =>
      editTrack(trackId, (track) => ({ ...track, ...patch }), merge && `${trackId}:${merge}`),
    removeTrack: (trackId: string) => {
      change((current) => ({
        ...current,
        tracks: current.tracks.filter((track) => track.id !== trackId),
      }));
      if (selected?.trackId === trackId) setSelected(null);
    },
    /** The whole mix's EQ: heard at once while playing, saved with the project. */
    setMasterEq: (eq: MixEq) => {
      engine.current?.setMasterEq(eq);
      change((current) => ({ ...current, masterEq: eq }), "masterEq");
    },
    setTrackEq: (trackId: string, eq: MixEq) => {
      engine.current?.setTrackEq(trackId, eq);
      editTrack(trackId, (track) => ({ ...track, eq }), `${trackId}:eq`);
    },
    setMasterVolume: (volume: number) => {
      engine.current?.setMasterVolume(volume);
      change((current) => ({ ...current, masterVolume: volume }), "master");
    },
    setSnap: (snap: boolean) => change((current) => ({ ...current, snap })),
    setBpm: (bpm: number) =>
      change(
        (current) => ({ ...current, bpm: Math.min(240, Math.max(40, Math.round(bpm))) }),
        "bpm",
      ),
    peaks: (url: string, buckets: number) => sound().peaks(url, buckets),
    exportWav: () => void exportWav(),
    publishing,
    publishedUrl,
    publish: (artistPortal: string) => void publish(artistPortal),
    save: () => save.mutate({ projectId, name, data: project }),
    open,
    newProject: () => open({ projectId: null, name: "Untitled mix", data: emptyProject() }),
  };
}

export type Mixer = ReturnType<typeof useMixer>;
