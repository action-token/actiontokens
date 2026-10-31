"use client";

import {
  CheckCircle2,
  Coins,
  ListChecks,
  Loader2,
  Music2,
  Plus,
  Radio,
  ScrollText,
  Trophy,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@bandcoin/ui/components/select";
import { Textarea } from "@bandcoin/ui/components/textarea";
import { cn } from "@bandcoin/ui/lib/cn";
import {
  Field,
  FormPage,
  FormSection,
  MoreOptions,
  OptionGroup,
  OptionList,
  SwitchRow,
} from "@bandcoin/ui/patterns/form-page";
import { MarkdownEditor } from "@bandcoin/ui/patterns/markdown-editor";
import { validatePrice } from "@bandcoin/utils/asset-code";

import { Money } from "~/components/money";
import { formatAmount } from "~/lib/format";
import { useSessionDraft } from "~/lib/use-session-draft";
import { api, type RouterOutputs } from "~/trpc/react";

import { AiFillCard } from "../ai/ai-fill-card";
import { AiTextButton } from "../ai/ai-text-button";
import { Note, Toggle } from "../catalog/form-parts";
import { PaymentToast } from "../payments/payment-toast";
import { covers, type RuleType, ruleSummary } from "./bounty-rules";
import {
  choiceValue,
  heldOf,
  parseChoice,
  type PrizeKey,
  prizeGroups,
  prizeInput,
  prizeLabel,
  shortIssuer,
  tokenKey,
} from "./prize-choice";
import { MAX_TRACKS, type PickedTrack, TrackPicker } from "./track-picker";
import { useBountyFunding } from "./use-bounty-payments";

type Existing = RouterOutputs["bounties"]["get"];

type State = {
  title: string;
  summary: string;
  description: string;
  instructions: string[];
  instructionInput: string;
  requiresActionCam: boolean;
  music: boolean;
  musicMode: "HYBRID" | "MUSIC_ONLY";
  ruleType: RuleType;
  requiredTracks: number;
  totalPlays: number;
  tracks: PickedTrack[];
  prizeAmount: string;
  currency: PrizeKey;
  source: "wallet" | "storage";
  maxWinners: string;
  rewardNote: string;
  eventId: string;
};

const MAX_INSTRUCTIONS = 10;
const NO_EVENT = "none";
const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

const blank: State = {
  title: "",
  summary: "",
  description: "",
  instructions: [],
  instructionInput: "",
  requiresActionCam: false,
  music: false,
  musicMode: "HYBRID",
  ruleType: "ANY_N",
  requiredTracks: 1,
  totalPlays: 10,
  tracks: [],
  prizeAmount: "",
  currency: "BANDCOIN",
  source: "wallet",
  maxWinners: "1",
  rewardNote: "",
  eventId: NO_EVENT,
};

function fromExisting(bounty: Existing): State {
  const rule = bounty.musicRule;
  return {
    ...blank,
    title: bounty.title,
    summary: bounty.summary,
    description: bounty.description,
    instructions: bounty.instructions,
    requiresActionCam: bounty.requiresActionCam,
    music: rule !== null,
    musicMode: rule?.mode ?? "HYBRID",
    ruleType: rule?.ruleType ?? "ANY_N",
    requiredTracks: rule?.requiredTracks ?? 1,
    totalPlays: rule?.totalPlays ?? 10,
    tracks: (rule?.tracks ?? []).map((track) => ({
      id: track.id,
      title: track.title,
      artistName: track.artistName,
      albumArtUrl: track.albumArtUrl,
      durationSec: track.durationSec,
      lastFmUrl: track.lastFmUrl,
      targetPlays: track.targetPlays,
    })),
    prizeAmount: bounty.prizeAmount,
    currency:
      bounty.prize.currency ?? tokenKey(bounty.prizeAssetCode ?? "", bounty.prizeAssetIssuer ?? ""),
    source: bounty.fundedFromStorage ? "storage" : "wallet",
    maxWinners: String(bounty.maxWinners),
    rewardNote: bounty.rewardNote ?? "",
    eventId: bounty.eventId ?? NO_EVENT,
  };
}

/** The listening rules as the server stores them, or null when it isn't a music bounty. */
function musicOf(state: State) {
  if (!state.music) return null;
  return {
    mode: state.musicMode,
    ruleType: state.ruleType,
    requiredTracks:
      state.ruleType === "ANY_N" ? Math.min(state.requiredTracks, state.tracks.length || 1) : null,
    totalPlays: state.ruleType === "TOTAL_PLAYS" ? state.totalPlays : null,
    tracks: state.tracks.map((track) => ({
      title: track.title,
      artistName: track.artistName,
      albumArtUrl: track.albumArtUrl,
      durationSec: track.durationSec,
      targetPlays: track.targetPlays,
      lastFmUrl: track.lastFmUrl,
    })),
  };
}

/**
 * One form for a new bounty and for editing one. A new bounty is saved as a
 * draft, then its prize is moved into escrow (the artist pays the prize and the
 * network fee). Once it exists the prize, winners and funding source are fixed;
 * the text, instructions and listening rules can still change, and changing the
 * tracks starts everyone's listening progress over.
 */
export function BountyForm({
  existing,
  kind,
}: {
  existing?: Existing;
  /** Picked in the "New bounty" menu: turns the music challenge on or off. */
  kind?: "general" | "music";
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const editing = Boolean(existing);
  const [state, setState, clearDraft] = useSessionDraft<State>(
    "bounty-draft",
    existing ? fromExisting(existing) : blank,
    !editing,
  );
  const set = <K extends keyof State>(key: K, value: State[K]) =>
    setState((current) => ({ ...current, [key]: value }));

  // The menu's choice wins over a draft left from before.
  useEffect(() => {
    if (kind) setState((current) => ({ ...current, music: kind === "music" }));
  }, [kind, setState]);

  const sources = api.bounties.fundingSources.useQuery(undefined, { enabled: !editing });
  const lastFm = api.bounties.lastFm.useQuery(undefined, { enabled: state.music });
  const events = api.engage.events.useQuery();
  const disconnect = api.bounties.disconnectLastFm.useMutation({
    onSuccess: () => {
      toast.success("Last.fm disconnected");
      void lastFm.refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const funding = useBountyFunding((bountyId) => {
    clearDraft();
    router.push(`/bounties/${bountyId}`);
  });
  const create = api.bounties.create.useMutation();
  const update = api.bounties.update.useMutation({
    onSuccess: () => {
      toast.success("Saved");
      void utils.bounties.invalidate();
      router.push(`/bounties/${existing?.id}`);
    },
    onError: (error) => toast.error(messageOf(error)),
  });

  const prizeProblem = state.prizeAmount ? validatePrice(state.prizeAmount) : null;
  const winners = Number(state.maxWinners);
  const winnersOk = Number.isInteger(winners) && winners >= 1 && winners <= 100;
  const musicOnly = state.music && state.musicMode === "MUSIC_ONLY";
  const instructionsOk = musicOnly || state.instructions.length > 0;
  const tracksOk =
    !state.music ||
    (state.tracks.length > 0 &&
      (state.ruleType !== "ANY_N" || state.requiredTracks >= 1) &&
      (state.ruleType !== "TOTAL_PLAYS" || state.totalPlays >= 1));
  const holdings = sources.data?.[state.source];
  const balance = heldOf(holdings, state.currency);
  const shown = prizeLabel(state.currency);
  const enough = covers(balance, state.prizeAmount);
  const ready =
    state.title.trim().length > 0 &&
    instructionsOk &&
    tracksOk &&
    (editing || (state.prizeAmount !== "" && !prizeProblem && winnersOk && enough !== false));
  const busy = funding.busy || create.isPending || update.isPending;

  const initialMusic = useMemo(
    () => (existing ? JSON.stringify(musicOf(fromExisting(existing))) : ""),
    [existing],
  );
  const aiContext = {
    title: state.title,
    summary: state.summary,
    prize: state.prizeAmount ? `${state.prizeAmount} ${shown.code}` : "",
    winners: state.maxWinners,
  };

  function addInstruction() {
    const line = state.instructionInput.trim();
    if (!line) return;
    if (state.instructions.length >= MAX_INSTRUCTIONS)
      return void toast.error(`Use at most ${MAX_INSTRUCTIONS} instructions.`);
    setState((current) => ({
      ...current,
      instructions: [...current.instructions, line],
      instructionInput: "",
    }));
  }

  async function submit(submitted: FormEvent) {
    submitted.preventDefault();
    if (!ready || busy) return;
    const music = musicOf(state);
    const text = {
      title: state.title,
      summary: state.summary,
      description: state.description,
      rewardNote: state.rewardNote || null,
      instructions: musicOnly ? [] : state.instructions,
      requiresActionCam: state.requiresActionCam,
      eventId: state.eventId === NO_EVENT ? null : state.eventId,
    };
    if (existing) {
      // Only send the rules when they changed: sending them starts everyone's progress over.
      return void update.mutate({
        bountyId: existing.id,
        ...text,
        ...(JSON.stringify(music) === initialMusic ? {} : { music }),
      });
    }
    try {
      const { bountyId, tokenSetup } = await create.mutateAsync({
        ...text,
        music,
        prizeAmount: state.prizeAmount,
        ...prizeInput(state.currency),
        maxWinners: winners,
        fundedFromStorage: state.source === "storage",
      });
      await funding.fund(
        bountyId,
        <Money amount={state.prizeAmount} {...shown} />,
        tokenSetup ? shown.code : undefined,
      );
    } catch (error) {
      toast.error(messageOf(error));
    }
  }

  const actions = (
    <>
      <Button asChild type="button" variant="ghost">
        <Link href={existing ? `/bounties/${existing.id}` : "/bounties"}>Cancel</Link>
      </Button>
      <Button type="submit" disabled={!ready || busy}>
        {busy && <Loader2 className="animate-spin" />}
        {editing ? "Save changes" : "Create and fund"}
      </Button>
    </>
  );

  return (
    <>
      <FormPage
        title={existing ? existing.title : "New bounty"}
        eyebrow="Fans"
        description={
          existing
            ? undefined
            : "A public challenge with a prize held in escrow. Fans join, submit, and you pick the winners."
        }
        back={
          existing
            ? { href: `/bounties/${existing.id}`, label: "Bounty" }
            : { href: "/bounties", label: "Bounties" }
        }
        onSubmit={(event) => void submit(event)}
        actions={actions}
        aside={
          <>
            <section className="bg-surface border-fg/10 grid gap-2 rounded-[1.4rem] border-2 p-5">
              <p className="text-primary-text text-xs font-semibold tracking-wide uppercase">
                Preview
              </p>
              <p className="display text-xl leading-snug">{state.title || "Untitled bounty"}</p>
              {state.summary && (
                <p className="text-fg-muted line-clamp-3 text-sm">{state.summary}</p>
              )}
              <p className="flex items-center gap-2 text-sm">
                <Trophy className="text-primary-text size-4" />
                {state.prizeAmount && !prizeProblem ? (
                  <Money amount={state.prizeAmount} {...shown} />
                ) : (
                  "Prize"
                )}
                <span className="text-fg-muted">
                  · {winnersOk ? winners : 1} winner{winners === 1 ? "" : "s"}
                </span>
              </p>
              {state.music && (
                <p className="text-fg-muted flex items-center gap-2 text-sm">
                  <Music2 className="size-4" /> Music challenge
                </p>
              )}
            </section>
            {!editing && (
              <section className="bg-surface border-fg/10 grid gap-2 rounded-[1.4rem] border-2 p-5 text-sm">
                <h2 className="display text-xl">What you pay</h2>
                <p className="flex justify-between gap-3">
                  <span className="text-fg-muted">Prize into escrow</span>
                  {state.prizeAmount && !prizeProblem ? (
                    <Money amount={state.prizeAmount} {...shown} />
                  ) : (
                    <span>…</span>
                  )}
                </p>
                <p className="flex justify-between gap-3">
                  <span className="text-fg-muted">Network fee</span>
                  <span>Shown before you confirm</span>
                </p>
                {balance !== undefined && (
                  <p className="flex justify-between gap-3 border-t pt-2">
                    <span className="text-fg-muted">
                      {state.source === "storage" ? "Storage" : "Wallet"} balance
                    </span>
                    <Money amount={balance} {...shown} />
                  </p>
                )}
                {enough === false && (
                  <p role="alert" className="text-danger text-xs">
                    Not enough {shown.code} here. Pick another token or place, or add {shown.code}{" "}
                    first. We never convert it for you.
                  </p>
                )}
                <p className="text-fg-faint text-xs">
                  The prize stays in escrow until you pick winners. You can&apos;t change it
                  afterwards.
                </p>
              </section>
            )}
          </>
        }
      >
        {!editing && (
          <AiFillCard
            form="bounty"
            context={aiContext}
            examples={[
              "Best cover of my new single, winner gets 500 BANDCOIN",
              "Fan art contest for the album, 3 winners",
              "Listen to my EP three times this week",
            ]}
            apply={(result) => {
              const before = state;
              setState((current) => ({
                ...current,
                title: result.title,
                summary: result.summary,
                description: result.description,
                rewardNote: result.rewardNote ?? current.rewardNote,
                instructions: result.instructions.slice(0, MAX_INSTRUCTIONS),
                maxWinners: String(result.maxWinners),
                prizeAmount: result.prizeAmount ? String(result.prizeAmount) : current.prizeAmount,
              }));
              return () => setState(before);
            }}
          />
        )}

        <FormSection title="The challenge" icon={ScrollText}>
          <Field
            label="Title"
            htmlFor="bounty-title"
            required
            action={
              <AiTextButton
                form="bounty"
                field="title"
                maxChars={120}
                value={state.title}
                context={aiContext}
                onChange={(text) => set("title", text)}
              />
            }
          >
            <Input
              id="bounty-title"
              value={state.title}
              maxLength={120}
              onChange={(event) => set("title", event.target.value)}
            />
            <p className="text-fg-faint text-right text-xs">{state.title.length} / 120</p>
          </Field>
          <Field
            label="Description"
            htmlFor="bounty-description"
            hint="Markdown works: headings, lists, links."
            action={
              <AiTextButton
                form="bounty"
                field="description"
                maxChars={5000}
                value={state.description}
                context={aiContext}
                onChange={(text) => set("description", text)}
              />
            }
          >
            <MarkdownEditor
              value={state.description}
              onChange={(text) => set("description", text)}
              placeholder="What you want, how winners are chosen, any rules…"
              minHeight={260}
            />
          </Field>
        </FormSection>

        <FormSection
          title="What fans submit"
          icon={ListChecks}
          description={
            musicOnly
              ? "A pure music challenge needs no submission: fans are checked on Last.fm."
              : "Fans send a report that follows these steps."
          }
        >
          {!musicOnly && (
            <>
              <Field
                label="Instructions"
                htmlFor="bounty-instruction"
                required
                hint={`${state.instructions.length} / ${MAX_INSTRUCTIONS} added`}
              >
                <div className="flex gap-2">
                  <Input
                    id="bounty-instruction"
                    value={state.instructionInput}
                    maxLength={200}
                    placeholder="For example: Post a video of your cover"
                    onChange={(event) => set("instructionInput", event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      addInstruction();
                    }}
                  />
                  <Button type="button" variant="secondary" onClick={addInstruction}>
                    <Plus /> Add
                  </Button>
                </div>
              </Field>
              {state.instructions.length > 0 && (
                <ol className="divide-y rounded-lg border">
                  {state.instructions.map((line, index) => (
                    <li key={`${line}-${index}`} className="flex items-start gap-3 p-3 text-sm">
                      <span className="text-fg-faint num w-5 shrink-0 text-right">{index + 1}</span>
                      <span className="min-w-0 flex-1 break-words">{line}</span>
                      <button
                        type="button"
                        aria-label={`Remove instruction ${index + 1}`}
                        onClick={() =>
                          set(
                            "instructions",
                            state.instructions.filter((_, at) => at !== index),
                          )
                        }
                        className="text-fg-muted hover:text-fg"
                      >
                        <X className="size-4" />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </FormSection>

        <FormSection
          title="Prize"
          icon={Coins}
          description={
            editing
              ? existing?.funded
                ? "The prize is in escrow, so it can't be changed."
                : "The prize is fixed once the bounty is created. Delete the draft to change it."
              : "The prize is paid into escrow now and held until you pick winners."
          }
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Prize"
              htmlFor="bounty-prize"
              required
              error={prizeProblem ? `The prize: ${prizeProblem}` : null}
            >
              <Input
                id="bounty-prize"
                inputMode="decimal"
                value={state.prizeAmount}
                disabled={editing}
                aria-invalid={Boolean(prizeProblem)}
                onChange={(event) => set("prizeAmount", event.target.value.trim())}
              />
            </Field>
            <Field
              label="Paid in"
              htmlFor="bounty-currency"
              hint="From your wallet or your storage account. Your fan token is listed first."
            >
              <Select
                value={choiceValue(state.source, state.currency)}
                disabled={editing}
                onValueChange={(value) => {
                  const { source, key } = parseChoice(value);
                  setState((current) => ({ ...current, source, currency: key }));
                }}
              >
                <SelectTrigger id="bounty-currency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {prizeGroups(sources.data, { source: state.source, key: state.currency }).map(
                    (group) => (
                      <SelectGroup key={group.source}>
                        <SelectLabel>{group.label}</SelectLabel>
                        {group.options.map((option) => (
                          <SelectItem
                            key={option.key}
                            value={choiceValue(group.source, option.key)}
                          >
                            {option.code}
                            {option.fanToken ? (
                              <span className="text-fg-faint"> · your fan token</span>
                            ) : (
                              option.issuer && (
                                <span className="text-fg-faint">
                                  {" "}
                                  · {shortIssuer(option.issuer)}
                                </span>
                              )
                            )}
                            {option.have !== undefined && (
                              <span className="text-fg-faint">
                                {" "}
                                · {group.source === "storage" ? "storage has" : "you have"}{" "}
                                {formatAmount(
                                  option.have,
                                  prizeLabel(option.key).currency ?? "XLM",
                                )}
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ),
                  )}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="Winners"
              htmlFor="bounty-winners"
              required
              hint="How many fans can win. The prize is split as you pick them."
            >
              <Input
                id="bounty-winners"
                inputMode="numeric"
                value={state.maxWinners}
                disabled={editing}
                onChange={(event) =>
                  set("maxWinners", event.target.value.replace(/\D/g, "").slice(0, 3))
                }
                className="max-w-28"
              />
            </Field>
          </div>
        </FormSection>

        <MoreOptions
          open={state.music}
          hint="Card summary, Action Cam, music challenge, reward note, event"
        >
          <OptionGroup title="Card summary">
            <Field
              label="Summary"
              htmlFor="bounty-summary"
              hint="A line for the bounty card."
              action={
                <AiTextButton
                  form="bounty"
                  field="summary"
                  maxChars={600}
                  value={state.summary}
                  context={aiContext}
                  onChange={(text) => set("summary", text)}
                />
              }
            >
              <Textarea
                id="bounty-summary"
                value={state.summary}
                rows={2}
                maxLength={600}
                onChange={(event) => set("summary", event.target.value)}
              />
            </Field>
          </OptionGroup>
          <OptionGroup title="Challenge options">
            <OptionList>
              <SwitchRow
                icon={CheckCircle2}
                title="Require the Action Cam"
                hint="Photos and videos must be taken in the app, so where and when they were taken is proven."
                checked={state.requiresActionCam}
                onChange={(value) => set("requiresActionCam", value)}
              />
              <SwitchRow
                icon={Music2}
                title="Music challenge"
                hint="Fans must also listen to chosen tracks, checked automatically on Last.fm."
                checked={state.music}
                onChange={(value) => set("music", value)}
              >
                <div className="grid gap-5">
                  {lastFm.data ? (
                    <p className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2">
                        <CheckCircle2 className="text-success size-4" /> Last.fm connected as{" "}
                        <b className="font-mono">@{lastFm.data.username}</b>
                      </span>
                      <button
                        type="button"
                        disabled={disconnect.isPending}
                        onClick={() => disconnect.mutate()}
                        className="text-danger text-xs font-semibold uppercase"
                      >
                        {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
                      </button>
                    </p>
                  ) : (
                    <div className="bg-danger-soft grid gap-2 rounded-lg p-3 text-sm">
                      <p className="flex items-center gap-2 font-semibold">
                        <Radio className="text-danger size-4" /> Connect your Last.fm account
                      </p>
                      <p className="text-fg-muted text-xs">
                        To create music bounties, connect Last.fm so scrobbles can be verified.
                      </p>
                      <Button asChild size="sm" className="justify-self-start">
                        <a
                          href={`/api/lastfm/auth?redirect=${encodeURIComponent("/bounties/new")}`}
                        >
                          Connect Last.fm
                        </a>
                      </Button>
                    </div>
                  )}

                  <Field label="Strategy" htmlFor="bounty-mode">
                    <div
                      className="grid gap-2 sm:grid-cols-2"
                      id="bounty-mode"
                      role="radiogroup"
                      aria-label="Strategy"
                    >
                      {(
                        [
                          {
                            value: "HYBRID",
                            title: "Hybrid",
                            text: "Last.fm plays and a submission report.",
                          },
                          {
                            value: "MUSIC_ONLY",
                            title: "Music only",
                            text: "Fully automatic: Last.fm plays decide.",
                          },
                        ] as const
                      ).map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={state.musicMode === option.value}
                          onClick={() => set("musicMode", option.value)}
                          className={cn(
                            "grid gap-0.5 rounded-lg border p-3 text-left transition-colors",
                            state.musicMode === option.value
                              ? "border-fg bg-primary/10"
                              : "hover:bg-surface-2",
                          )}
                        >
                          <b className="text-sm">{option.title}</b>
                          <span className="text-fg-muted text-xs">{option.text}</span>
                        </button>
                      ))}
                    </div>
                  </Field>

                  <Field label="Tracks" htmlFor="bounty-tracks" required>
                    <TrackPicker
                      tracks={state.tracks}
                      onChange={(tracks) => set("tracks", tracks)}
                    />
                  </Field>

                  <Field label="Rule" htmlFor="bounty-rule">
                    <div className="flex flex-wrap items-center gap-2" id="bounty-rule">
                      <Toggle
                        pressed={state.ruleType === "ALL"}
                        onClick={() => set("ruleType", "ALL")}
                      >
                        All tracks
                      </Toggle>
                      <Toggle
                        pressed={state.ruleType === "ANY_N"}
                        onClick={() => set("ruleType", "ANY_N")}
                      >
                        Any N tracks
                      </Toggle>
                      <Toggle
                        pressed={state.ruleType === "TOTAL_PLAYS"}
                        onClick={() => set("ruleType", "TOTAL_PLAYS")}
                      >
                        Total plays
                      </Toggle>
                      {state.ruleType === "ANY_N" && (
                        <Input
                          inputMode="numeric"
                          aria-label="How many tracks"
                          value={state.requiredTracks}
                          onChange={(event) =>
                            set(
                              "requiredTracks",
                              Math.min(
                                MAX_TRACKS,
                                Number(event.target.value.replace(/\D/g, "")) || 1,
                              ),
                            )
                          }
                          className="w-16"
                        />
                      )}
                      {state.ruleType === "TOTAL_PLAYS" && (
                        <Input
                          inputMode="numeric"
                          aria-label="Total plays"
                          value={state.totalPlays}
                          onChange={(event) =>
                            set("totalPlays", Number(event.target.value.replace(/\D/g, "")) || 1)
                          }
                          className="w-20"
                        />
                      )}
                    </div>
                    <Note>
                      {ruleSummary({
                        ruleType: state.ruleType,
                        trackCount: state.tracks.length,
                        requiredTracks: state.requiredTracks,
                        totalPlays: state.totalPlays,
                      })}
                    </Note>
                  </Field>
                  {editing && (
                    <Note>
                      Changing the tracks or the rule starts every fan&apos;s listening progress
                      over.
                    </Note>
                  )}
                </div>
              </SwitchRow>
            </OptionList>
          </OptionGroup>
          <OptionGroup title="Reward note and event">
            <Field
              label="Reward note"
              htmlFor="bounty-reward-note"
              hint="How and when winners are paid, if you want to say."
              action={
                <AiTextButton
                  form="bounty"
                  field="reward note"
                  maxChars={600}
                  value={state.rewardNote}
                  context={aiContext}
                  onChange={(text) => set("rewardNote", text)}
                />
              }
            >
              <Textarea
                id="bounty-reward-note"
                value={state.rewardNote}
                rows={2}
                maxLength={600}
                onChange={(event) => set("rewardNote", event.target.value)}
              />
            </Field>
            <Field
              label="Linked event"
              htmlFor="bounty-event"
              hint="Optional. Shows this bounty on the event."
            >
              <Select value={state.eventId} onValueChange={(value) => set("eventId", value)}>
                <SelectTrigger id="bounty-event" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_EVENT}>No event</SelectItem>
                  {events.data?.map((event) => (
                    <SelectItem key={event.id} value={event.id}>
                      {event.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </OptionGroup>
        </MoreOptions>
      </FormPage>
      <PaymentToast flow={funding} />
    </>
  );
}
