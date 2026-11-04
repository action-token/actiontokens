import { isAppError } from "@bandcoin/errors";

import type { Context } from "../../context";
import {
  endLiveRun,
  holdLiveMinute,
  keepLiveMinute,
  LIVE_MAX_MINUTES,
  livePrice,
  refundLiveMinute,
  startLiveRun,
} from "./live";
import type { LiveConnect, LiveLyria } from "./lyria";

/** What the browser sends. */
export type LiveIn =
  | { type: "prompts"; prompts: { text: string; weight: number }[] }
  | { type: "config"; bpm?: number; density?: number; brightness?: number }
  | { type: "play" }
  | { type: "pause" }
  | { type: "stop" };

/** What the browser gets back. */
export type LiveOut =
  | { type: "ready"; pricePerMinute: number }
  | { type: "audio"; data: string }
  | { type: "charged"; minutes: number; coins: number; generationId: string }
  | { type: "outOfCoins"; message: string }
  | { type: "filtered"; reason: string }
  | { type: "ended"; reason: string }
  | { type: "error"; message: string };

const clamp = (value: unknown, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : undefined;

/**
 * One browser's live jam, start to finish. Billing: a minute's coins are held
 * when playing reaches it and kept once music arrives in it; a minute that
 * gets no music is refunded. Pausing stops the clock; it ends at 30 minutes
 * or when coins run out.
 */
export class LiveSession {
  private lyria: LiveLyria | null = null;
  private runId: string | null = null;
  private minutes = 0;
  private price = 0;
  private playedMs = 0;
  private playingSince: number | null = null;
  /** The current minute's hold, until music arrives in it */
  private pending: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  private charging: Promise<void> | null = null;

  constructor(
    private ctx: Pick<Context, "db">,
    private userId: string,
    private deps: {
      connect: LiveConnect;
      send: (message: LiveOut) => void;
      now?: () => number;
      tickMs?: number;
    },
  ) {}

  private now = () => (this.deps.now ?? Date.now)();

  /** Connects to Lyria; nothing is charged until Play. */
  async open() {
    this.price = await livePrice(this.ctx);
    this.lyria = await this.deps.connect({
      onAudio: (data) => {
        if (this.closed) return;
        if (this.pending) {
          const entry = this.pending;
          this.pending = null;
          void keepLiveMinute(this.ctx, entry);
        }
        this.deps.send({ type: "audio", data });
      },
      onFiltered: (reason) => this.deps.send({ type: "filtered", reason }),
      onError: (message) => {
        this.deps.send({ type: "error", message });
        void this.close(message);
      },
      onClose: () => {
        if (this.closed) return;
        this.deps.send({ type: "ended", reason: "The music stopped." });
        void this.close();
      },
    });
    this.deps.send({ type: "ready", pricePerMinute: this.price });
  }

  played() {
    return this.playedMs + (this.playingSince === null ? 0 : this.now() - this.playingSince);
  }

  async handle(message: LiveIn) {
    if (this.closed || !this.lyria) return;
    switch (message.type) {
      case "prompts": {
        const prompts = message.prompts
          .slice(0, 4)
          .map((prompt) => ({
            text: String(prompt.text).trim().slice(0, 200),
            weight: clamp(prompt.weight, 0, 2) ?? 1,
          }))
          .filter((prompt) => prompt.text.length > 0);
        if (prompts.length > 0) await this.lyria.setWeightedPrompts({ weightedPrompts: prompts });
        return;
      }
      case "config":
        await this.lyria.setMusicGenerationConfig({
          musicGenerationConfig: {
            bpm: clamp(message.bpm, 60, 200),
            density: clamp(message.density, 0, 1),
            brightness: clamp(message.brightness, 0, 1),
          },
        });
        return;
      case "play":
        if (this.playingSince !== null) return;
        if (!(await this.chargeIfDue())) return;
        this.playingSince = this.now();
        this.lyria.play();
        this.timer ??= setInterval(() => void this.tick(), this.deps.tickMs ?? 1000);
        return;
      case "pause":
        this.pauseClock();
        this.lyria.pause();
        return;
      case "stop":
        this.pauseClock();
        this.lyria.stop();
        return;
    }
  }

  private pauseClock() {
    if (this.playingSince === null) return;
    this.playedMs += this.now() - this.playingSince;
    this.playingSince = null;
  }

  /** Every second while playing: a new minute is charged when playing reaches it. */
  async tick() {
    if (this.playingSince === null || this.closed) return;
    if (this.played() >= LIVE_MAX_MINUTES * 60_000) {
      this.deps.send({ type: "ended", reason: `Live jams stop at ${LIVE_MAX_MINUTES} minutes.` });
      return void this.close();
    }
    if (!(await this.chargeIfDue())) {
      this.pauseClock();
      this.lyria?.pause();
    }
  }

  /** Holds the next minute once playing has used up the paid ones. False when coins ran out. */
  private chargeIfDue(): Promise<boolean> {
    if (this.played() < this.minutes * 60_000) return Promise.resolve(true);
    if (this.charging) return this.charging.then(() => true);
    const run = (async () => {
      // A minute that never got music is given back before the next is taken.
      if (this.pending && this.runId) {
        await refundLiveMinute(this.ctx, this.pending, this.runId, this.price);
        this.pending = null;
      }
      this.runId ??= await startLiveRun(this.ctx, this.userId);
      this.pending = await holdLiveMinute(this.ctx, {
        userId: this.userId,
        generationId: this.runId,
        minute: this.minutes + 1,
        coins: this.price,
      });
      this.minutes += 1;
      this.deps.send({
        type: "charged",
        minutes: this.minutes,
        coins: this.minutes * this.price,
        generationId: this.runId,
      });
    })();
    this.charging = run.then(
      () => undefined,
      () => undefined,
    );
    return run.then(
      () => {
        this.charging = null;
        return true;
      },
      (error: unknown) => {
        this.charging = null;
        this.deps.send({
          type: "outOfCoins",
          message: isAppError(error) ? error.message : "Couldn't take the next minute's coins.",
        });
        return false;
      },
    );
  }

  /** Ends the jam: the current minute is refunded if no music came in it. */
  async close(error?: string) {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.pauseClock();
    try {
      this.lyria?.close();
    } catch {
      // Already closed.
    }
    if (this.runId) {
      if (this.pending) await refundLiveMinute(this.ctx, this.pending, this.runId, this.price);
      await endLiveRun(this.ctx, this.runId, error);
    }
  }
}
