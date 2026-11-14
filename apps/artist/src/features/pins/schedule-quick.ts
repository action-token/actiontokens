/**
 * The quick ways to end a pin on the Schedule tab, and how a run is put in words. Pure, so the card
 * and its tests share them; dates are the artist's own (local) time.
 */
const DAY_MS = 86_400_000;

export type QuickEnd = { id: "today" | "weekend" | "week" | "month"; label: string; end: Date };

/** 11:59 PM on the same day. */
function endOfDay(date: Date) {
  const end = new Date(date);
  end.setHours(23, 59, 0, 0);
  return end;
}

/** Today, this weekend, 1 week, 1 month, counted from `from` (when the pin starts, or now). */
export function quickEnds(from: Date): QuickEnd[] {
  const today = endOfDay(from);
  const toSunday = (7 - from.getDay()) % 7;
  const weekend = endOfDay(new Date(from.getTime() + toSunday * DAY_MS));
  const options: QuickEnd[] = [{ id: "today", label: "Today", end: today }];
  // On a Sunday "this weekend" is the same as today.
  if (toSunday > 0) options.push({ id: "weekend", label: "This weekend", end: weekend });
  options.push(
    { id: "week", label: "1 week", end: new Date(from.getTime() + 7 * DAY_MS) },
    { id: "month", label: "1 month", end: new Date(from.getTime() + 30 * DAY_MS) },
  );
  return options;
}

/** "Fri 20 Nov, 6:00 PM". */
export function dayAndTime(date: Date, locale?: string) {
  const day = date.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
  const time = date.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  return `${day}, ${time}`;
}

/** "3 days", "1 day", "5 hours", "40 minutes". */
export function lengthOf(from: Date, to: Date) {
  const minutes = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
  if (minutes >= 1440) {
    const days = Math.round(minutes / 1440);
    return `${days} ${days === 1 ? "day" : "days"}`;
  }
  if (minutes >= 60) {
    const hours = Math.round(minutes / 60);
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

/**
 * The run in plain words: "Live now until Fri 20 Nov, 6:00 PM · 7 days", or "Starts Sat 21 Nov, ...".
 * Null until it has an end, or when it ends before it starts.
 */
export function describeRun(start: Date | null, end: Date | null, now: Date, locale?: string) {
  if (!end) return null;
  const from = start && start > now ? start : now;
  if (end <= from) return null;
  const run = lengthOf(from, end);
  return start && start > now
    ? `Starts ${dayAndTime(start, locale)}, ends ${dayAndTime(end, locale)} · ${run}`
    : `Live now until ${dayAndTime(end, locale)} · ${run}`;
}
