import type { PickedFile } from "../file-field";

/**
 * Locked content as the NFT form edits it: what each piece is, its file or
 * link, and its optional unlock condition (places to visit, within a radius).
 * The server checks the same rules (services/artist/locked-content).
 */
export type LockedType = "SONG" | "IMAGE" | "VIDEO" | "OTHER";
export type UnlockPlace = { lat: number; lng: number; label: string };
export type LockedDraft = {
  key: string;
  type: LockedType;
  label: string;
  /** SONG, IMAGE, VIDEO: the uploaded file */
  file: PickedFile | null;
  /** OTHER: a web link */
  link: string;
  gated: boolean;
  radius: string;
  places: UnlockPlace[];
};

export const MAX_LOCKED = 20;
export const MAX_PLACES = 20;
export const RADIUS = { min: 10, max: 1000, default: 50 } as const;

export const LOCKED_TYPES: { value: LockedType; label: string; accept: string }[] = [
  { value: "SONG", label: "Song", accept: "audio/*" },
  { value: "IMAGE", label: "Image", accept: "image/*" },
  { value: "VIDEO", label: "Video", accept: "video/*" },
  { value: "OTHER", label: "Link", accept: "" },
];

let counter = 0;
export const newLocked = (): LockedDraft => ({
  key: `locked-${Date.now()}-${counter++}`,
  type: "SONG",
  label: "",
  file: null,
  link: "",
  gated: false,
  radius: String(RADIUS.default),
  places: [],
});

const isWebLink = (text: string) => {
  try {
    const url = new URL(text.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

/** What's wrong with one piece, field by field; empty when it can be saved. */
export function draftProblems(draft: LockedDraft) {
  const problems: { content?: string; radius?: string; places?: string; label?: string } = {};
  if (draft.label.trim().length > 80) problems.label = "Keep the name to 80 characters.";
  if (draft.type === "OTHER") {
    if (!isWebLink(draft.link)) problems.content = "Enter a web link starting with https://.";
  } else if (!draft.file) {
    problems.content = "Upload the file.";
  }
  if (draft.gated) {
    const radius = Number(draft.radius);
    if (!(radius >= RADIUS.min && radius <= RADIUS.max))
      problems.radius = `From ${RADIUS.min} to ${RADIUS.max} m.`;
    if (draft.places.length === 0) problems.places = "Add at least one place, or turn this off.";
  }
  return problems;
}

/** Whether the whole list can be saved: at least one piece, each one complete. */
export function lockedReady(drafts: LockedDraft[]) {
  return (
    drafts.length > 0 &&
    drafts.length <= MAX_LOCKED &&
    drafts.every((draft) => Object.keys(draftProblems(draft)).length === 0)
  );
}

/** The API input, in the order shown. */
export function toLockedInput(drafts: LockedDraft[]) {
  return drafts.map((draft) => ({
    type: draft.type,
    url: draft.type === "OTHER" ? draft.link.trim() : (draft.file?.url ?? ""),
    label: draft.label.trim() || undefined,
    unlock: draft.gated
      ? {
          radiusMeters: Number(draft.radius),
          places: draft.places.map((place) => ({
            lat: place.lat,
            lng: place.lng,
            label: place.label.trim() || undefined,
          })),
        }
      : undefined,
  }));
}
