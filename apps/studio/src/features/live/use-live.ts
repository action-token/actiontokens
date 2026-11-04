"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

import { declare, putToStorage } from "~/lib/upload";
import { api } from "~/trpc/react";

import { channelOf, decodePcm, LIVE_CHANNELS, LIVE_RATE, recordingWav } from "./pcm";

export type LivePrompt = { text: string; weight: number };
export type LiveSettings = { bpm: number; density: number; brightness: number };
export type LiveStatus = "idle" | "connecting" | "ready" | "playing" | "paused" | "ended";

type Server =
  | { type: "ready"; pricePerMinute: number }
  | { type: "audio"; data: string }
  | { type: "charged"; minutes: number; coins: number; generationId: string }
  | { type: "outOfCoins"; message: string }
  | { type: "filtered"; reason: string }
  | { type: "ended"; reason: string }
  | { type: "error"; message: string };

/** A little audio queued ahead of the playhead hides network gaps. */
const LEAD_SECONDS = 0.25;

/**
 * A live jam: connect to the worker with a one-minute ticket, send prompts and
 * settings, play the audio as it arrives (scheduled back to back on one
 * clock), and keep a recording to save at the end.
 */
export function useLive() {
  const utils = api.useUtils();
  const ticket = api.music.liveTicket.useMutation();
  const sign = api.projects.upload.useMutation();
  const save = api.music.saveRecording.useMutation();

  const [status, setStatus] = useState<LiveStatus>("idle");
  const [price, setPrice] = useState<number | null>(null);
  const [charged, setCharged] = useState({ minutes: 0, coins: 0 });
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState<"no" | "saving" | "yes">("no");

  const socket = useRef<WebSocket | null>(null);
  const context = useRef<AudioContext | null>(null);
  const sources = useRef<AudioBufferSourceNode[]>([]);
  const nextAt = useRef(0);
  const chunks = useRef<Int16Array[]>([]);
  const runId = useRef<string | null>(null);
  const playing = useRef(false);

  const send = useCallback((message: object) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(message));
  }, []);

  const silence = useCallback(() => {
    for (const source of sources.current) {
      try {
        source.stop();
      } catch {
        // Already finished.
      }
    }
    sources.current = [];
    nextAt.current = 0;
  }, []);

  const play = useCallback((data: string) => {
    const audio = context.current;
    if (!audio || !playing.current) return;
    const samples = decodePcm(data);
    if (samples.length === 0) return;
    chunks.current.push(samples);
    const frames = samples.length / LIVE_CHANNELS;
    const buffer = audio.createBuffer(LIVE_CHANNELS, frames, LIVE_RATE);
    buffer.copyToChannel(channelOf(samples, 0) as Float32Array<ArrayBuffer>, 0);
    buffer.copyToChannel(channelOf(samples, 1) as Float32Array<ArrayBuffer>, 1);
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(audio.destination);
    const startAt = Math.max(nextAt.current, audio.currentTime + LEAD_SECONDS);
    source.start(startAt);
    nextAt.current = startAt + buffer.duration;
    sources.current.push(source);
    source.onended = () => {
      sources.current = sources.current.filter((entry) => entry !== source);
    };
  }, []);

  const onMessage = useCallback(
    (message: Server) => {
      switch (message.type) {
        case "ready":
          setPrice(message.pricePerMinute);
          setStatus("ready");
          return;
        case "audio":
          play(message.data);
          return;
        case "charged":
          runId.current = message.generationId;
          setCharged({ minutes: message.minutes, coins: message.coins });
          void utils.coins.balance.invalidate();
          return;
        case "outOfCoins":
          playing.current = false;
          silence();
          setStatus("paused");
          setNotice(message.message);
          return;
        case "filtered":
          setNotice(`That prompt was filtered: ${message.reason}`);
          return;
        case "ended":
          playing.current = false;
          setStatus("ended");
          setNotice(message.reason);
          return;
        case "error":
          playing.current = false;
          setStatus("ended");
          setNotice(message.message);
          return;
      }
    },
    [play, silence, utils],
  );

  async function connect() {
    setNotice(null);
    setSaved("no");
    setCharged({ minutes: 0, coins: 0 });
    chunks.current = [];
    runId.current = null;
    setStatus("connecting");
    // Made right in the click, before any waiting, so the browser lets it make sound.
    void context.current?.close();
    context.current = new AudioContext({ sampleRate: LIVE_RATE });
    try {
      const { url, ticket: signed } = await ticket.mutateAsync();
      const ws = new WebSocket(`${url}?ticket=${encodeURIComponent(signed)}`);
      socket.current = ws;
      ws.onmessage = (event) => onMessage(JSON.parse(event.data as string) as Server);
      ws.onclose = () => {
        playing.current = false;
        setStatus((now) => (now === "idle" ? now : "ended"));
      };
      ws.onerror = () => {
        setNotice("Couldn't reach the live music service.");
        setStatus("ended");
      };
    } catch (error) {
      void context.current?.close();
      context.current = null;
      setStatus("idle");
      toast.error(error instanceof Error ? error.message : "Couldn't start live music.");
    }
  }

  function start() {
    playing.current = true;
    setStatus("playing");
    setNotice(null);
    void context.current?.resume();
    send({ type: "play" });
  }

  function pause() {
    playing.current = false;
    silence();
    setStatus("paused");
    send({ type: "pause" });
  }

  /** Ends the jam and keeps the recording in your music. */
  async function finish() {
    playing.current = false;
    silence();
    socket.current?.close();
    socket.current = null;
    void context.current?.close();
    context.current = null;
    setStatus("ended");
    const generationId = runId.current;
    if (!generationId || chunks.current.length === 0) return;
    setSaved("saving");
    try {
      const { blob, cut } = recordingWav(chunks.current);
      const file = new File([blob], "live-jam.wav", { type: "audio/wav" });
      const declared = await declare(file);
      const signed = await sign.mutateAsync(declared);
      await putToStorage(file, signed, declared.checksum);
      await save.mutateAsync({ generationId, url: signed.fileUrl });
      await utils.music.recent.invalidate();
      setSaved("yes");
      toast.success(
        cut ? "Saved the first 8 minutes of your jam." : "Your jam is saved in Your music.",
      );
    } catch (error) {
      setSaved("no");
      toast.error(error instanceof Error ? error.message : "Couldn't save your jam.");
    } finally {
      chunks.current = [];
    }
  }

  useEffect(
    () => () => {
      playing.current = false;
      socket.current?.close();
      void context.current?.close();
    },
    [],
  );

  return {
    status,
    price,
    charged,
    notice,
    saved,
    connecting: ticket.isPending || status === "connecting",
    connect,
    start,
    pause,
    finish,
    setPrompts: (prompts: LivePrompt[]) => send({ type: "prompts", prompts }),
    setSettings: (settings: Partial<LiveSettings>) => send({ type: "config", ...settings }),
  };
}
