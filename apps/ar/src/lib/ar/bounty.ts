import type { RouterOutputs } from "~/trpc/react";

/**
 * ── Bounty display helpers ─────────────────────────────────────────────────
 *
 * One place that turns the router's facts into the words and tones the UI
 * shows, so a bounty's status reads the same on a list card, the detail
 * header and the pinned action bar.
 */

export type BountyCard = RouterOutputs["bounty"]["list"]["items"][number];
export type BountyDetail = RouterOutputs["bounty"]["byId"];
export type BountyPerson = BountyDetail["participantList"][number]["user"];

export type Tone = "accent" | "gold" | "muted" | "info";

export const TONE_CLASS: Record<Tone, string> = {
  accent: "border-ar-accent/50 bg-ar-accent/15 text-ar-accent-hot",
  gold: "border-rarity-legendary/50 bg-rarity-legendary/15 text-rarity-legendary",
  muted: "border-ar-line-bright bg-white/[0.05] text-ar-faint",
  info: "border-rarity-rare/50 bg-rarity-rare/15 text-rarity-rare",
};

/** The one badge a card shows: where *you* stand on it, else whether it's open. */
export function viewerBadge(b: Pick<BountyCard, "status" | "joined" | "isCreator"> & { won?: boolean }): {
  label: string;
  tone: Tone;
} {
  if (b.won) return { label: "You won", tone: "gold" };
  if (b.isCreator) return { label: "Yours", tone: "info" };
  if (b.status === "COMPLETED") return { label: "Ended", tone: "muted" };
  if (b.status === "PAUSED") return { label: "Paused", tone: "muted" };
  if (b.joined) return { label: "Joined", tone: "accent" };
  return { label: "Open", tone: "accent" };
}

/** "25,000" or "12.5", never a long tail of decimals. */
export const formatAmount = (amount: string | number) =>
  Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 });

/** The prize split evenly, as the old page showed "per winner". */
export const perWinner = (b: Pick<BountyCard, "prize" | "maxWinners">) => Number(b.prize.amount) / Math.max(1, b.maxWinners);

export const nameOf = (person: BountyPerson) => person.displayName ?? (person.username ? `@${person.username}` : "Anonymous");

/** "3m ago", "5h ago", "2d ago", then the date. */
export function timeAgo(at: Date | string) {
  const seconds = Math.max(0, (Date.now() - new Date(at).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 7 * 86_400) return `${Math.floor(seconds / 86_400)}d ago`;
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** The listening rule in words: "All 3 tracks", "2 of 3 tracks", "Total plays". */
export function musicRuleLabel(music: NonNullable<BountyDetail["music"]>) {
  const total = music.tracks.length;
  if (music.ruleType === "ALL") return `All ${total} tracks required`;
  if (music.ruleType === "ANY_N") return `${Math.min(music.requiredTracks ?? 1, total)} of ${total} tracks`;
  return "Total plays across all tracks";
}
