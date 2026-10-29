const two = (n: number) => String(n).padStart(2, "0");

/** A date as the value a `datetime-local` input wants: the viewer's own clock, no zone. */
export const toLocalInput = (date: Date | string) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`;
};

/** The reverse: what the input holds, as a date; null when it is empty. */
export const fromLocalInput = (value: string) => (value ? new Date(value) : null);

/** "Sat 1 Dec, 8:00 pm" in the viewer's zone. */
export const formatWhen = (date: Date | string) =>
  new Date(date).toLocaleString("en-US", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
