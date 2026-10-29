"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AppError, ErrorCodes } from "@bandcoin/errors";

import { StemEngine, type LoadedStem } from "~/lib/stems/engine";
import { defaultSetting, type Mix, startPosition } from "~/lib/stems/mix";

type StemSource = { id: string; name: string; color: string; url: string };

/** Loads every stem through the app's stem route and decodes it. Throws if any one fails. */
async function loadStems(sources: StemSource[]): Promise<LoadedStem[]> {
  const context = new AudioContext();
  try {
    return await Promise.all(
      sources.map(async (source) => {
        const response = await fetch(source.url);
        if (!response.ok) throw new AppError(ErrorCodes.EXTERNAL_SERVICE_FAILED, { message: `${source.name} didn't load` });
        return { id: source.id, name: source.name, color: source.color, buffer: await context.decodeAudioData(await response.arrayBuffer()) };
      }),
    );
  } finally {
    void context.close();
  }
}

/**
 * Stem mode for the bottom player. Turn it on and the stems take over from the
 * normal audio at the same spot; turn it off and the normal audio picks up
 * where the stems were. While on, the stems follow the player's play/pause.
 * It resets whenever the song changes.
 */
export function useStemMode({
  trackId,
  sources,
  playing,
  onEnded,
}: {
  trackId: string | null;
  sources: StemSource[];
  playing: boolean;
  /** The stems reached their end by themselves */
  onEnded: () => void;
}) {
  const engine = useRef<StemEngine | null>(null);
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mix, setMix] = useState<Mix>({});
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const ended = useRef(onEnded);
  const wasPlaying = useRef(playing);
  useEffect(() => {
    ended.current = onEnded;
    wasPlaying.current = playing;
  });

  const stop = useCallback((): number => {
    const at = engine.current?.position ?? 0;
    engine.current?.close();
    engine.current = null;
    setActive(false);
    setLoading(false);
    setError(null);
    setMix({});
    return at;
  }, []);

  // A different song: leave stem mode and forget its mix.
  useEffect(() => () => void stop(), [trackId, stop]);

  /** Switch in at `fromSeconds` of the normal audio (clamped to the stems' length). */
  async function start(fromSeconds: number) {
    if (!trackId || sources.length === 0) return;
    const forTrack = trackId;
    setLoading(true);
    setError(null);
    try {
      const loaded = await loadStems(sources);
      if (forTrack !== trackId) return;
      const created = new StemEngine(loaded);
      created.onEnded = () => ended.current();
      engine.current?.close();
      engine.current = created;
      setMix(Object.fromEntries(loaded.map((stem) => [stem.id, defaultSetting()])));
      setDuration(created.duration);
      await created.seek(startPosition(fromSeconds, created.duration));
      setActive(true);
      if (wasPlaying.current) await created.play();
    } catch {
      setError("Couldn't load the stems. Try again.");
    } finally {
      setLoading(false);
    }
  }

  // The mix reaches the sound as it changes.
  useEffect(() => {
    engine.current?.apply(mix);
  }, [mix, active]);

  // Stems follow the player's play/pause.
  useEffect(() => {
    if (!active) return;
    if (playing) void engine.current?.play();
    else engine.current?.pause();
  }, [playing, active]);

  // The playhead follows the stems' clock while they play.
  useEffect(() => {
    if (!active || !playing) return;
    let frame = 0;
    const tick = () => {
      setPosition(engine.current?.position ?? 0);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, playing]);

  return {
    active,
    loading,
    error,
    mix,
    setMix,
    position,
    duration,
    available: sources.length > 0,
    reset: () => setMix(Object.fromEntries(sources.map((source) => [source.id, defaultSetting()]))),
    start,
    /** Leave stem mode; returns where the stems were, for the normal audio to continue from. */
    stop,
    seek: (seconds: number) => {
      setPosition(seconds);
      void engine.current?.seek(seconds);
    },
  };
}
