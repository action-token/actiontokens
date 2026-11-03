/** How a music run reads while it's made, once it's ready, or when it didn't work. */
export type RunStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED";

export const isWorking = (status: RunStatus) => status === "QUEUED" || status === "RUNNING";

export function runLabel(status: RunStatus, kind: string | null) {
  const what = kind === "Full song" ? "song" : "clip";
  switch (status) {
    case "QUEUED":
      return `Waiting to start your ${what}…`;
    case "RUNNING":
      return what === "song"
        ? "Making your song. This can take a couple of minutes."
        : "Making your clip…";
    case "SUCCEEDED":
      return "Ready";
    case "FAILED":
      return "Didn't work: coins refunded";
    case "CANCELED":
      return "Stopped";
  }
}

/** A short, safe file name for downloads: "lo-fi-beat-with-piano.mp3". */
export function downloadName(prompt: string, mimeType: string) {
  const base = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  const ext = mimeType.includes("wav") ? "wav" : "mp3";
  return `${base || "bandcoin-music"}.${ext}`;
}
