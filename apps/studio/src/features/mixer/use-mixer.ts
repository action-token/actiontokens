"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

import { declare, putToStorage } from "~/lib/upload";
import { api } from "~/trpc/react";

import { MixEngine } from "./engine";
import {
  emptyProject,
  MAX_TRACKS,
  mixLength,
  type MixProject,
  type MixTrack,
  moveTo,
  newTrack,
  trim,
} from "./mix";

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

export type OpenProject = { projectId: string | null; name: string; data: MixProject };

/**
 * Everything the mixer does, in one place: the project (tracks, master volume),
 * playback (play, pause, stop, seek, loop, with a moving playhead), adding
 * audio (uploads and Lyria runs), editing clips, exporting a WAV and saving to
 * your account.
 */
export function useMixer() {
  const engine = useRef<MixEngine | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [name, setName] = useState("Untitled mix");
  const [project, setProject] = useState<MixProject>(emptyProject);
  const [dirty, setDirty] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [loop, setLoop] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [adding, setAdding] = useState(0);
  const [exporting, setExporting] = useState(false);
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

  const change = useCallback((next: (current: MixProject) => MixProject) => {
    setProject(next);
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
    if (current.tracks.length === 0) return;
    const start = from >= mixLength(current.tracks) ? 0 : from;
    try {
      await sound().play(current.tracks, start, current.masterVolume, () => {
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

  function seek(to: number) {
    const at = Math.max(0, to);
    setTime(at);
    if (playing) void play(at);
  }

  /** Adds an audio file already in storage (a Lyria run, an upload) as a new track. */
  async function addAudio(input: { name: string; url: string }) {
    if (projectRef.current.tracks.length >= MAX_TRACKS)
      return void toast.error(`A project holds up to ${MAX_TRACKS} tracks.`);
    setAdding((count) => count + 1);
    try {
      const buffer = await sound().load(input.url);
      change((current) => ({
        ...current,
        tracks: [
          ...current.tracks,
          newTrack({ ...input, duration: buffer.duration }, current.tracks.length),
        ],
      }));
    } catch (error) {
      toast.error(`${input.name}: ${messageOf(error)}`);
    } finally {
      setAdding((count) => count - 1);
    }
  }

  /** Uploads files from your device, then adds each as a track. */
  async function uploadFiles(files: File[]) {
    for (const file of files) {
      setAdding((count) => count + 1);
      try {
        const declared = await declare(file);
        const signed = await sign.mutateAsync(declared);
        await putToStorage(file, signed, declared.checksum);
        await addAudio({ name: file.name.replace(/\.[^.]+$/, ""), url: signed.fileUrl });
      } catch (error) {
        toast.error(`${file.name}: ${messageOf(error)}`);
      } finally {
        setAdding((count) => count - 1);
      }
    }
  }

  const edit = (id: string, apply: (track: MixTrack) => MixTrack) =>
    change((current) => ({
      ...current,
      tracks: current.tracks.map((track) => (track.id === id ? apply(track) : track)),
    }));

  async function exportWav() {
    setExporting(true);
    try {
      const blob = await sound().exportWav(project.tracks, project.masterVolume);
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

  function open(next: OpenProject) {
    stop();
    setProjectId(next.projectId);
    setName(next.name);
    setProject(next.data);
    setDirty(false);
  }

  return {
    projectId,
    name,
    setName: (value: string) => {
      setName(value);
      setDirty(true);
    },
    project,
    dirty,
    playing,
    time,
    loop,
    setLoop,
    zoom,
    setZoom,
    adding: adding > 0,
    exporting,
    saving: save.isPending,
    length: mixLength(project.tracks),
    play: () => void play(),
    pause,
    stop,
    seek,
    addAudio: (input: { name: string; url: string }) => void addAudio(input),
    uploadFiles: (files: File[]) => void uploadFiles(files),
    move: (id: string, startTime: number) => edit(id, (track) => moveTo(track, startTime)),
    trim: (id: string, edge: "start" | "end", delta: number) =>
      edit(id, (track) => trim(track, edge, delta)),
    update: (id: string, patch: Partial<Pick<MixTrack, "volume" | "muted" | "soloed" | "name">>) =>
      edit(id, (track) => ({ ...track, ...patch })),
    remove: (id: string) =>
      change((current) => ({
        ...current,
        tracks: current.tracks.filter((track) => track.id !== id),
      })),
    setMasterVolume: (volume: number) => {
      engine.current?.setMasterVolume(volume);
      change((current) => ({ ...current, masterVolume: volume }));
    },
    peaks: (url: string, buckets: number) => sound().peaks(url, buckets),
    exportWav: () => void exportWav(),
    save: () => save.mutate({ projectId, name, data: project }),
    open,
    newProject: () => open({ projectId: null, name: "Untitled mix", data: emptyProject() }),
  };
}

export type Mixer = ReturnType<typeof useMixer>;
