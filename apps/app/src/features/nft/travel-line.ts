const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** In a sentence: will the rewards open with the copy, or only after a trip? */
export function travelLine(total: number, gated: number, places: number) {
  if (places === 0)
    return total === 1
      ? "Its reward opens as soon as you own a copy."
      : `All ${total} rewards open as soon as you own a copy.`;
  const visit = `${plural(places, "place")} in person`;
  if (gated >= total)
    return total === 1
      ? `Its reward stays locked until you visit ${visit}.`
      : `All ${total} rewards stay locked until you visit ${visit}.`;
  const open = total - gated;
  return `${open} of ${total} rewards ${open === 1 ? "opens" : "open"} right away. The other ${
    gated === 1 ? "one needs" : `${gated} need`
  } a visit to ${visit}.`;
}
