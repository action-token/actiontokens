"use client";

import { AudioLines, Loader2, Pause, Play, RotateCcw, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { cn } from "@bandcoin/ui/lib/cn";

import { renderDemoStems } from "~/lib/stems/demo";
import { StemEngine, type LoadedStem } from "~/lib/stems/engine";
import { clampPan, clampVolume, defaultSetting, type Mix, toggle } from "~/lib/stems/mix";

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
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
  const update = (id: string, change: Partial<Mix[string]>) => setMix((current) => ({ ...current, [id]: { ...(current[id] ?? defaultSetting()), ...change } }));

  return (
    <div className="grid gap-6">
      <section className="bg-surface grid gap-3 rounded-2xl border p-5">
        <h2 className="text-lg font-semibold">How it works</h2>
        <ul className="text-fg-muted grid gap-1.5 text-sm">
          <li>Each stem is its own audio file. All of them start at the same instant and stay in sync, so together they are the song.</li>
          <li>The mixer changes each stem&apos;s volume and left/right position as it plays. <b className="text-fg">M</b> mutes one. <b className="text-fg">S</b> solos it: everything else goes quiet.</li>
          <li>On a real song only people who own it get the stems; everyone else hears the normal 30 second preview.</li>
        </ul>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={() => void loadDemo()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <AudioLines />} Load demo stems
          </Button>
          <Button asChild variant="secondary" disabled={busy}>
            <label className="cursor-pointer">
              <Upload /> Add your own audio files
              <input type="file" accept="audio/*" multiple hidden onChange={(event) => void loadFiles(event.target.files)} />
            </label>
          </Button>
        </div>
        {error && <p role="alert" className="text-danger text-sm">{error}</p>}
      </section>

      {stems.length > 0 && (
        <section aria-label="Stem player" className="bg-surface grid gap-5 rounded-2xl border p-5">
          <div className="flex items-center gap-4">
            <Button size="icon" aria-label={playing ? "Pause" : "Play"} className="bg-fg text-bg hover:bg-fg/90 shrink-0" onClick={() => void togglePlay()}>
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
            <Button variant="ghost" size="sm" onClick={() => setMix(Object.fromEntries(stems.map((stem) => [stem.id, defaultSetting()])))}>
              <RotateCcw /> Reset mix
            </Button>
          </div>

          <ul className="grid gap-2">
            {stems.map((stem) => {
              const setting = mix[stem.id] ?? defaultSetting();
              const anySolo = Object.values(mix).some((entry) => entry.solo);
              const heard = !setting.mute && (!anySolo || setting.solo);
              return (
                <li key={stem.id} className={cn("grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 rounded-xl border p-3 transition-opacity sm:grid-cols-[10rem_auto_minmax(0,1fr)_minmax(0,9rem)]", !heard && "opacity-50")}>
                  <span className="flex min-w-0 items-center gap-2 font-semibold">
                    <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: stem.color }} />
                    <span className="truncate">{stem.name}</span>
                  </span>
                  <span className="flex gap-1">
                    <StemToggle label="Mute" short="M" on={setting.mute} tone="danger" onClick={() => setMix((current) => toggle(current, stem.id, "mute"))} />
                    <StemToggle label="Solo" short="S" on={setting.solo} tone="primary" onClick={() => setMix((current) => toggle(current, stem.id, "solo"))} />
                  </span>
                  <label className="text-fg-muted col-span-2 flex items-center gap-2 text-xs sm:col-span-1">
                    Volume
                    <input type="range" aria-label={`${stem.name} volume`} min={0} max={1} step={0.01} value={setting.volume} onChange={(event) => update(stem.id, { volume: clampVolume(Number(event.target.value)) })} className="accent-fg h-1 min-w-0 flex-1 cursor-pointer" />
                    <span className="num w-8 text-right">{Math.round(setting.volume * 100)}</span>
                  </label>
                  <label className="text-fg-muted col-span-2 flex items-center gap-2 text-xs sm:col-span-1">
                    Pan
                    <input type="range" aria-label={`${stem.name} pan`} min={-1} max={1} step={0.05} value={setting.pan} onChange={(event) => update(stem.id, { pan: clampPan(Number(event.target.value)) })} onDoubleClick={() => update(stem.id, { pan: 0 })} className="accent-fg h-1 min-w-0 flex-1 cursor-pointer" />
                    <span className="num w-6 text-right">{setting.pan === 0 ? "C" : setting.pan < 0 ? "L" : "R"}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function StemToggle({ label, short, on, tone, onClick }: { label: string; short: string; on: boolean; tone: "danger" | "primary"; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "grid size-8 place-items-center rounded-md border text-xs font-bold transition-colors",
        on ? (tone === "danger" ? "bg-danger border-danger text-white" : "bg-primary text-primary-foreground border-fg") : "text-fg-muted hover:bg-surface-2",
      )}
    >
      {short}
    </button>
  );
}
