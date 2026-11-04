"use client";

import { Coins, Loader2, Pause, Play, Radio, Save } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";

import { type LivePrompt, type LiveSettings, useLive } from "./use-live";

const START: LivePrompt[] = [
  { text: "Warm lo-fi hip hop, soft piano", weight: 1 },
  { text: "", weight: 1 },
];
const SETTINGS: {
  key: keyof LiveSettings;
  label: string;
  min: number;
  max: number;
  step: number;
}[] = [
  { key: "bpm", label: "Tempo", min: 60, max: 200, step: 1 },
  { key: "density", label: "Busy-ness", min: 0, max: 1, step: 0.05 },
  { key: "brightness", label: "Brightness", min: 0, max: 1, step: 0.05 },
];

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-fg-muted grid min-w-0 gap-1 text-xs">
      <span className="flex justify-between">
        {label} <span className="text-fg">{step < 1 ? value.toFixed(2) : value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="accent-primary w-full"
      />
    </label>
  );
}

/**
 * Studio › Music › Live jam: steer Lyria RealTime as it plays. Charged by the
 * started minute while it plays; pausing stops the charge. The price is shown
 * before anything starts.
 */
export function LiveJam({ balance }: { balance: number | null }) {
  const live = useLive();
  const [prompts, setPrompts] = useState<LivePrompt[]>(START);
  const [settings, setSettings] = useState<LiveSettings>({
    bpm: 100,
    density: 0.5,
    brightness: 0.5,
  });
  const sent = useRef(false);

  const open = live.status !== "idle" && live.status !== "ended";
  const musicOn = live.status === "playing" || live.status === "paused";

  // Changes go to the music a moment after you stop moving.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      live.setPrompts(prompts);
      if (sent.current) live.setSettings(settings);
      sent.current = true;
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompts, settings, open]);

  useEffect(() => {
    if (live.status === "ready") sent.current = false;
  }, [live.status]);

  const filled = prompts.some((prompt) => prompt.text.trim());
  const short = live.price !== null && balance !== null && balance < live.price;
  const canSave = live.status === "ended" && live.saved === "no" && live.charged.minutes > 0;

  return (
    <section className="bg-surface grid gap-4 rounded-[1.4rem] border-2 p-5 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="display flex items-center gap-2 text-xl">
          <Radio className="text-primary-text size-5" /> Live jam
        </h2>
        <p className="text-fg-muted text-xs">
          {live.price === null
            ? "Charged by the minute while it plays"
            : `${live.price} coins a minute, only while it plays`}
        </p>
      </header>

      {!open ? (
        <div className="grid justify-items-start gap-3">
          <p className="text-fg-muted text-sm">
            Mix a few ideas and steer the music while it plays: change the tempo, the mood, the
            instruments. Connecting is free; you pay for each minute you play. You can pause any
            time, and a minute with no music is given back.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={live.connecting} onClick={() => void live.connect()}>
              {live.connecting ? <Loader2 className="animate-spin" /> : <Radio />}
              {live.status === "ended" ? "Start another jam" : "Start a live jam"}
            </Button>
            {canSave && (
              <Button variant="outline" onClick={() => void live.finish()}>
                <Save /> Save my jam
              </Button>
            )}
            {live.saved === "saving" && (
              <span className="text-fg-muted flex items-center gap-1 text-sm">
                <Loader2 className="size-4 animate-spin" /> Saving your jam…
              </span>
            )}
            {live.saved === "yes" && (
              <span className="text-fg-muted text-sm">Saved in Your music below.</span>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-2">
            {prompts.map((prompt, index) => (
              <div key={index} className="grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-3">
                <Input
                  aria-label={`Idea ${index + 1}`}
                  value={prompt.text}
                  maxLength={200}
                  placeholder={index === 0 ? "Describe a sound or a mood" : "Add another idea"}
                  onChange={(event) =>
                    setPrompts(
                      prompts.map((entry, at) =>
                        at === index ? { ...entry, text: event.target.value } : entry,
                      ),
                    )
                  }
                />
                <Slider
                  label="Mix"
                  value={prompt.weight}
                  min={0}
                  max={2}
                  step={0.1}
                  onChange={(weight) =>
                    setPrompts(
                      prompts.map((entry, at) => (at === index ? { ...entry, weight } : entry)),
                    )
                  }
                />
              </div>
            ))}
            {prompts.length < 4 && (
              <Button
                variant="ghost"
                size="sm"
                className="justify-self-start"
                onClick={() => setPrompts([...prompts, { text: "", weight: 1 }])}
              >
                Add an idea
              </Button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {SETTINGS.map((entry) => (
              <Slider
                key={entry.key}
                label={entry.label}
                min={entry.min}
                max={entry.max}
                step={entry.step}
                value={settings[entry.key]}
                onChange={(value) => setSettings({ ...settings, [entry.key]: value })}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {live.status === "playing" ? (
              <Button onClick={live.pause}>
                <Pause /> Pause
              </Button>
            ) : (
              <Button
                disabled={(live.status !== "ready" && live.status !== "paused") || !filled || short}
                onClick={live.start}
              >
                <Play />
                {live.status === "paused"
                  ? "Play again"
                  : live.price === null
                    ? "Play"
                    : `Play · ${live.price} coins for the first minute`}
              </Button>
            )}
            <Button variant="outline" onClick={() => void live.finish()}>
              <Save /> {musicOn ? "Finish and save" : "Close"}
            </Button>
            {live.charged.minutes > 0 && (
              <p className="text-fg-muted text-sm">
                Minute {live.charged.minutes} · {live.charged.coins} coins used
              </p>
            )}
          </div>
        </div>
      )}

      {live.notice && (
        <p role="status" className="bg-surface-2 rounded-xl p-3 text-sm">
          {live.notice}{" "}
          {/coins/i.test(live.notice) && (
            <Link
              href="/coins"
              className="text-primary-text inline-flex items-center gap-1 font-semibold hover:underline"
            >
              <Coins className="size-4" /> Top up
            </Link>
          )}
        </p>
      )}
      {short && open && (
        <Link
          href="/coins"
          className="text-primary-text flex items-center gap-1 text-sm font-semibold hover:underline"
        >
          <Coins className="size-4" /> Not enough coins: top up
        </Link>
      )}
    </section>
  );
}
