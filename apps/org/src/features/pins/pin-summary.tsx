import type { ReactNode } from "react";

import { formatWhen } from "~/lib/datetime";

export const PIN_TYPES = [
  { value: "OTHER", label: "Other" },
  { value: "EXPERIENCE", label: "Experience" },
  { value: "EVENT", label: "Event" },
  { value: "LAUNCH", label: "Launch" },
  { value: "BOUNTY", label: "Bounty" },
  { value: "LANDMARK", label: "Landmark" },
] as const;
export type PinTypeName = (typeof PIN_TYPES)[number]["value"];

const when = (date: Date | null) =>
  date && !Number.isNaN(date.getTime()) ? formatWhen(date) : "—";

/** The pin at a glance, updating as the form is filled in. */
export function PinSummary({
  title,
  imageUrl,
  type,
  autoCollect,
  who,
  reward,
  limit,
  spots,
  startsAt,
  endsAt,
}: {
  title: string;
  imageUrl?: string;
  type: PinTypeName;
  autoCollect: boolean;
  who: string;
  reward: string | null;
  limit: number;
  spots: number;
  startsAt: Date | null;
  endsAt: Date | null;
}) {
  const row = (label: string, value: ReactNode) => (
    <div className="flex justify-between gap-3 py-1.5 text-sm">
      <span className="text-fg-muted">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
  return (
    <section className="bg-surface border-fg/10 rounded-[1.4rem] border-2 p-5">
      <h2 className="display mb-3 text-xl">Summary</h2>
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="mb-3 aspect-video w-full rounded-lg object-cover" />
      )}
      <p className="text-sm font-semibold">{title.trim() ? title : "Untitled pin"}</p>
      <div className="mt-2 divide-y">
        {row("Collection", autoCollect ? "Auto" : "Tap to collect")}
        {row("Kind", PIN_TYPES.find((entry) => entry.value === type)?.label)}
        {row("Open to", who)}
        {row("Reward", reward ?? "None")}
        {row("Spots", spots)}
        {row("Fans who can collect", limit > 0 ? limit.toLocaleString("en-US") : "No limit")}
        {row("Starts", startsAt ? when(startsAt) : "When you save")}
        {row("Ends", when(endsAt))}
      </div>
    </section>
  );
}
