const DAY_MS = 86_400_000;

const day = (date: Date) =>
  date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** How many drops fit: one on the start date, then one every N days before the end. */
export function dropCount(start: Date, end: Date, dropEveryDays: number) {
  if (!(dropEveryDays >= 1) || end <= start) return 0;
  return Math.ceil((end.getTime() - start.getTime()) / (dropEveryDays * DAY_MS));
}

/** "Drops every 7 days from Nov 5, 2026 to Dec 5, 2026: about 5 drops." */
export function dropPlan(input: { start: Date; end: Date | null; dropEveryDays: number }) {
  const { start, end, dropEveryDays } = input;
  if (!end || !(dropEveryDays >= 1)) return "Pick an end date and how often it drops.";
  if (end <= start) return "It has to end after it starts.";
  const count = dropCount(start, end, dropEveryDays);
  const every = dropEveryDays === 1 ? "every day" : `every ${dropEveryDays} days`;
  return `Drops ${every} from ${day(start)} to ${day(end)}: ${count === 1 ? "1 drop" : `about ${count} drops`}.`;
}
