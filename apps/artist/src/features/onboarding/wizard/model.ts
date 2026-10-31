import { normalizeAssetCode, validateAssetCode } from "@bandcoin/utils/asset-code";
import { validateSlug } from "@bandcoin/utils/slug";

/** What the artist has typed so far, kept in the browser between visits. */
export type Draft = {
  avatarUrl: string;
  coverUrl: string;
  name: string;
  bio: string;
  tokenMode: "NEW" | "EXISTING";
  /** The new token's code; follows the name until typed */
  code: string;
  codeTouched: boolean;
  existingCode: string;
  issuer: string;
  tokenImage: string;
  /** The image an existing token already shows on Stellar (from the live check; not saved) */
  stellarImage: string;
  slug: string;
  slugTouched: boolean;
};

export const EMPTY_DRAFT: Draft = {
  avatarUrl: "",
  coverUrl: "",
  name: "",
  bio: "",
  tokenMode: "NEW",
  code: "",
  codeTouched: false,
  existingCode: "",
  issuer: "",
  tokenImage: "",
  stellarImage: "",
  slug: "",
  slugTouched: false,
};

export const STEPS = [
  { title: "Profile", desc: "Photo, name and bio" },
  { title: "Fan token", desc: "What fans hold" },
  { title: "Page address", desc: "Where your page lives" },
  { title: "Review & pay", desc: "Check, pay, done" },
] as const;

export const NAME_MAX = 60;
export const BIO_MAX = 500;
const ACCOUNT = /^G[A-Z2-7]{55}$/;

/** null when the code can be a fan token code, otherwise what to tell the artist. */
export function codeProblem(raw: string) {
  const code = normalizeAssetCode(raw);
  return validateAssetCode(code) ?? (code.length < 4 ? "Use 4 to 12 letters or numbers" : null);
}

export const issuerProblem = (issuer: string) =>
  ACCOUNT.test(issuer.trim()) ? null : "The issuer's public key starts with G (56 characters)";

export const slugProblem = (slug: string) => validateSlug(slug);

/** Can the artist go on from this step? (Live checks are passed in.) */
export function stepReady(step: number, draft: Draft, live: { slugOk: boolean; tokenOk: boolean }) {
  switch (step) {
    case 0:
      return (
        Boolean(draft.avatarUrl) &&
        draft.name.trim().length >= 2 &&
        draft.name.trim().length <= NAME_MAX
      );
    case 1:
      return draft.tokenMode === "NEW"
        ? !codeProblem(draft.code) && Boolean(draft.tokenImage)
        : // Its image is the one it already has on Stellar: nothing to upload.
          !codeProblem(draft.existingCode) && !issuerProblem(draft.issuer) && live.tokenOk;
    case 2:
      return !slugProblem(draft.slug) && live.slugOk;
    default:
      return true;
  }
}

/** The fan token as the server takes it. */
export const fanTokenOf = (draft: Draft) =>
  draft.tokenMode === "NEW"
    ? { mode: "NEW" as const, code: normalizeAssetCode(draft.code), coverUrl: draft.tokenImage }
    : {
        mode: "EXISTING" as const,
        code: normalizeAssetCode(draft.existingCode),
        issuer: draft.issuer.trim(),
      };

/** The token's picture: the one they uploaded for a new token, or the one it already has on Stellar. */
export const tokenPicture = (draft: Draft) =>
  draft.tokenMode === "NEW" ? draft.tokenImage : draft.stellarImage;

const storageKey = (userId: string) => `bandcoin-onboarding:${userId}`;

export function readDraft(userId: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    return raw ? { ...EMPTY_DRAFT, ...(JSON.parse(raw) as Partial<Draft>) } : null;
  } catch {
    return null;
  }
}

export function saveDraft(userId: string, draft: Draft) {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(draft));
  } catch {
    // Storage blocked: the answers last until the page is closed.
  }
}

export function clearDraft(userId: string) {
  try {
    window.localStorage.removeItem(storageKey(userId));
  } catch {
    // Nothing to clear.
  }
}
