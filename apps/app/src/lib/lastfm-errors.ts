/** What the Last.fm return trip says went wrong (the `error` flag set by /api/lastfm/callback). */
export const LASTFM_ERRORS: Record<string, string> = {
  lastfm_unavailable: "Last.fm isn't set up yet.",
  missing_token: "Last.fm didn't send a sign-in token. Try again.",
  lastfm_failed: "Could not connect your Last.fm account. Please try again.",
};

export const lastFmErrorText = (flag: string) =>
  LASTFM_ERRORS[flag] ?? "Could not connect your Last.fm account. Please try again.";
