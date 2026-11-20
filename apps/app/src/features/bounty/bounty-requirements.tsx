"use client";

import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ListChecks,
  Music,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@actiontokens/ui/lib/cn";

import type { RouterOutputs } from "~/trpc/react";

import {
  FLIP_AFTER_MS,
  requirementSides,
  type RequirementSide,
  turnSide,
  visibleEntries,
} from "./requirement-sides";

type Bounty = RouterOutputs["bounty"]["byId"];

const SIDE: Record<RequirementSide, { label: string; icon: typeof Music }> = {
  music: { label: "Music", icon: Music },
  general: { label: "General", icon: ListChecks },
};

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * What a bounty asks for, in its hero. With both kinds the card has two sides:
 * music, then general. A second card peeks out behind it, it tips once on
 * arrival, and a bar counts down to flipping by itself after 5 seconds. The
 * arrows go either way. Pointing at the card or opening "more" holds it still.
 */
export function BountyRequirements({ bounty }: { bounty: Bounty }) {
  const sides = requirementSides(bounty);
  const twoSided = sides.length > 1;
  const [index, setIndex] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [turns, setTurns] = useState(0);
  const card = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const countdown = useRef<Animation | null>(null);
  const side = sides[index] ?? null;

  function turn(step: number) {
    const animate = !reducedMotion();
    if (animate)
      card.current?.animate(
        [
          { transform: `perspective(1000px) rotateY(${step > 0 ? 90 : -90}deg)` },
          { transform: "perspective(1000px) rotateY(0deg)" },
        ],
        { duration: 420, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
      );
    setExpanded(false);
    setIndex((current) => turnSide(current, step, sides.length));
    setTurns((count) => count + 1);
  }

  // Tips on arrival, so it reads as a card with another side.
  useEffect(() => {
    if (!twoSided || reducedMotion()) return;
    card.current?.animate(
      [
        { transform: "perspective(1000px) rotateY(0deg)" },
        { transform: "perspective(1000px) rotateY(-16deg)" },
        { transform: "perspective(1000px) rotateY(0deg)" },
      ],
      { duration: 800, delay: 700, easing: "ease-in-out" },
    );
  }, [twoSided]);

  // The bar's animation is the timer: when it runs out, the card flips.
  useEffect(() => {
    if (!twoSided || reducedMotion() || !bar.current) return;
    const animation = bar.current.animate(
      [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }],
      { duration: FLIP_AFTER_MS, easing: "linear", fill: "forwards" },
    );
    countdown.current = animation;
    animation.onfinish = () => turn(1);
    return () => {
      animation.onfinish = null;
      animation.cancel();
    };
    // Restarts on every turn, whichever way it went.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [twoSided, turns]);

  const hold = hovering || expanded;
  useEffect(() => {
    const animation = countdown.current;
    if (!animation) return;
    if (hold) animation.pause();
    else animation.play();
  }, [hold, turns]);

  return (
    <div
      className="relative text-white"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {twoSided && (
        <div
          aria-hidden
          className="absolute inset-0 translate-x-2 translate-y-2 rotate-2 rounded-[1.4rem] border border-white/15 bg-white/[0.04]"
        />
      )}
      <div
        ref={card}
        className="gloss relative grid gap-3 overflow-hidden rounded-[1.4rem] border border-white/20 bg-neutral-900/70 p-5"
      >
        <header className="flex items-center justify-between gap-2">
          <h2 className="display text-2xl">
            {bounty.music?.mode === "MUSIC_ONLY" ? "Listening challenge" : "Requirements"}
          </h2>
          {twoSided && side && (
            <div className="flex items-center gap-1">
              <TurnButton label="Previous requirements" onClick={() => turn(-1)}>
                <ChevronLeft className="size-4" />
              </TurnButton>
              <span className="num w-8 text-center text-xs font-semibold text-white/70">
                {index + 1}/{sides.length}
              </span>
              <TurnButton label="Next requirements" onClick={() => turn(1)}>
                <ChevronRight className="size-4" />
              </TurnButton>
            </div>
          )}
        </header>

        {twoSided && (
          <div className="grid gap-2">
            <div role="group" aria-label="Requirement kinds" className="flex gap-1.5">
              {sides.map((entry, position) => {
                const { label, icon: Icon } = SIDE[entry];
                return (
                  <button
                    key={entry}
                    type="button"
                    aria-pressed={position === index}
                    onClick={() => position !== index && turn(position > index ? 1 : -1)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
                      position === index
                        ? "bg-primary text-primary-foreground border-transparent"
                        : "border-white/20 text-white/70 hover:text-white",
                    )}
                  >
                    <Icon className="size-3" /> {label}
                  </button>
                );
              })}
            </div>
            <div aria-hidden className="h-1 overflow-hidden rounded-full bg-white/15">
              <div ref={bar} className="bg-primary h-full origin-left" />
            </div>
          </div>
        )}

        {/* Both sides share one cell, so the card keeps the taller one's height when it flips. */}
        <div className="grid">
          {sides.map((entry) => {
            const open = entry === side && expanded;
            return (
              <div
                key={entry}
                className={cn(
                  "col-start-1 row-start-1 grid content-start gap-3",
                  entry !== side && "invisible",
                )}
              >
                {entry === "music" ? (
                  <MusicSide bounty={bounty} expanded={open} />
                ) : (
                  <GeneralSide steps={bounty.instructions} expanded={open} />
                )}
                <MoreButton bounty={bounty} side={entry} expanded={open} onToggle={setExpanded} />
              </div>
            );
          })}
        </div>
        {!side && bounty.music?.mode !== "MUSIC_ONLY" && (
          <p className="text-sm text-white/70 italic">No specific requirements listed.</p>
        )}
      </div>
    </div>
  );
}

function TurnButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
    >
      {children}
    </button>
  );
}

function MusicSide({ bounty, expanded }: { bounty: Bounty; expanded: boolean }) {
  const music = bounty.music;
  if (!music) return null;
  const { shown } = visibleEntries(music.tracks, expanded);
  return (
    <div className="grid gap-2">
      <ul className="grid gap-1.5">
        {shown.map((track) => (
          <li key={track.id} className="flex items-center gap-3">
            {track.albumArtUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts
              <img
                src={track.albumArtUrl}
                alt=""
                className="size-8 shrink-0 rounded-lg border border-white/15 object-cover"
              />
            ) : (
              <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/15 bg-white/10">
                <Music className="size-4 text-white/70" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[13px] font-semibold">{track.title}</b>
              <span className="block truncate text-xs text-white/65">{track.artistName}</span>
            </span>
            <span className="font-mono text-xs font-semibold">{track.targetPlays}×</span>
          </li>
        ))}
      </ul>
      <p className="border-t border-white/15 pt-2 text-xs text-white/65">
        {music.ruleType === "ALL"
          ? `All ${music.tracks.length} tracks required`
          : music.ruleType === "ANY_N"
            ? `${Math.min(music.requiredTracks ?? 1, music.tracks.length)} of ${music.tracks.length} tracks`
            : "Total plays across all tracks"}
      </p>
    </div>
  );
}

function GeneralSide({ steps, expanded }: { steps: string[]; expanded: boolean }) {
  const { shown } = visibleEntries(steps, expanded);
  return (
    <ol className="grid gap-3.5">
      {shown.map((step, position) => (
        <li key={position} className="flex items-start gap-2.5 text-sm leading-snug text-white/80">
          <CheckCircle2 className="text-primary mt-0.5 size-4 shrink-0" /> {step}
        </li>
      ))}
    </ol>
  );
}

function MoreButton({
  bounty,
  side,
  expanded,
  onToggle,
}: {
  bounty: Bounty;
  side: RequirementSide;
  expanded: boolean;
  onToggle: (expanded: boolean) => void;
}) {
  const entries = side === "music" ? (bounty.music?.tracks ?? []) : bounty.instructions;
  const { extra } = visibleEntries<unknown>(entries, expanded);
  if (extra === 0) return null;
  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={() => onToggle(!expanded)}
      className="flex items-center gap-1 justify-self-start text-xs font-semibold text-white/85 hover:text-white"
    >
      {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
      {expanded ? "Show less" : `+${extra} more`}
    </button>
  );
}
