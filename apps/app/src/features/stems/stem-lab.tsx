"use client";

import { AudioLines, Loader2, Pause, Play, RotateCcw, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@actiontokens/ui/components/button";

import { renderDemoStems } from "~/lib/stems/demo";
import { StemEngine, type LoadedStem } from "~/lib/stems/engine";
import { defaultSetting, type Mix } from "~/lib/stems/mix";

import { StemRows } from "./stem-rows";

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const COLORS = ["#e5484d", "#30a46c", "#0091ff", "#f76b15", "#ab4aba", "#12a594"];

/**
 * A test bench for the stem player. Load four generated demo stems, or add your
 * own audio files (each file becomes a stem), then play and mix them live.
 */
export function StemLab() {
  const engine = useRef<StemEngine | null>(null);
  const [stems, setStems] = useState<LoadedStem[]>([]);
  const [mix, setMix] = useState<Mix>({});
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const replace = useCallback((next: LoadedStem[]) => {
    engine.current?.close();
    const created = new StemEngine(next);
    created.onEnded = () => setPlaying(false);
    engine.current = created;
    setStems(next);
    setMix(Object.fromEntries(next.map((stem) => [stem.id, defaultSetting()])));
    setPlaying(false);
    setPosition(0);
  }, []);

  useEffect(() => () => engine.current?.close(), []);

  // The playhead follows the audio clock while playing.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      setPosition(engine.current?.position ?? 0);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  useEffect(() => engine.current?.apply(mix), [mix, stems]);

  async function loadDemo() {
    setBusy(true);
    setError(null);
    try {
      replace(await renderDemoStems());
    } catch {
      setError("Couldn't make the demo stems in this browser.");
    } finally {
      setBusy(false);
    }
  }

  async function loadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const context = new AudioContext();
      const decoded = await Promise.all(
        [...files].map(async (file, index) => ({
          id: `file-${index}`,
          name: file.name.replace(/\.[^.]+$/, ""),
          color: COLORS[index % COLORS.length]!,
          buffer: await context.decodeAudioData(await file.arrayBuffer()),
        })),
      );
      void context.close();
      replace(decoded);
    } catch {
      setError("One of those files couldn't be read as audio. Try MP3, WAV, M4A or OGG.");
    } finally {
      setBusy(false);
    }
  }

  async function togglePlay() {
    if (!engine.current) return;
    if (engine.current.playing) {
      engine.current.pause();
      setPlaying(false);
    } else {
      await engine.current.play();
      setPlaying(true);
    }
  }

  const duration = Math.max(0, ...stems.map((stem) => stem.buffer.duration));

  return (
    <div className="grid gap-6">
      <section className="bg-surface grid gap-3 rounded-2xl border p-5">
        <h2 className="text-lg font-semibold">How it works</h2>
        <ul className="text-fg-muted grid gap-1.5 text-sm">
          <li>
            Each stem is its own audio file. All of them start at the same instant and stay in sync,
            so together they are the song.
          </li>
          <li>
            The mixer changes each stem&apos;s volume and left/right position as it plays.{" "}
            <b className="text-fg">M</b> mutes one. <b className="text-fg">S</b> solos it:
            everything else goes quiet.
          </li>
          <li>
            On a real song only people who own it get the stems; everyone else hears the normal 30
            second preview.
          </li>
        </ul>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={() => void loadDemo()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <AudioLines />} Load demo stems
          </Button>
          <Button asChild variant="secondary" disabled={busy}>
            <label className="cursor-pointer">
              <Upload /> Add your own audio files
              <input
                type="file"
                accept="audio/*"
                multiple
                hidden
                onChange={(event) => void loadFiles(event.target.files)}
              />
            </label>
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-danger text-sm">
            {error}
          </p>
        )}
      </section>

      {stems.length > 0 && (
        <section aria-label="Stem player" className="bg-surface grid gap-5 rounded-2xl border p-5">
          <div className="flex items-center gap-4">
            <Button
              size="icon"
              aria-label={playing ? "Pause" : "Play"}
              className="bg-fg text-bg hover:bg-fg/90 shrink-0"
              onClick={() => void togglePlay()}
            >
              {playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
            </Button>
            <span className="num text-fg-muted w-10 text-right text-xs">{clock(position)}</span>
            <input
              type="range"
              aria-label="Seek"
              min={0}
              max={duration}
              step={0.1}
              value={position}
              onChange={(event) => {
                const next = Number(event.target.value);
                setPosition(next);
                void engine.current?.seek(next);
              }}
              className="accent-fg h-1 min-w-0 flex-1 cursor-pointer"
            />
            <span className="num text-fg-faint w-10 text-xs">{clock(duration)}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setMix(Object.fromEntries(stems.map((stem) => [stem.id, defaultSetting()])))
              }
            >
              <RotateCcw /> Reset mix
            </Button>
          </div>

          <StemRows stems={stems} mix={mix} setMix={setMix} />
        </section>
      )}
    </div>
  );
}
