/** Who can open a post, and who can comment on or collect it (see services/artist/posts). */
export type Audience = "EVERYONE" | "FOLLOWERS" | "SUBSCRIBERS" | "MEMBERS";
export type Access = "VIEWERS" | "FOLLOWERS" | "SUBSCRIBERS" | "MEMBERS" | "NOBODY";

export type PostSettings = {
  audience: Audience;
  tierId: string | null;
  commentAccess: Access;
  commentTierId: string | null;
  collectAccess: Access;
  collectTierId: string | null;
  copies: number;
};

export const DEFAULT_COPIES = 100;
export const MAX_COPIES = 10_000;

export const AUDIENCE_LABEL: Record<Audience, string> = {
  EVERYONE: "Everyone",
  FOLLOWERS: "Followers",
  SUBSCRIBERS: "Subscribers",
  MEMBERS: "Members",
};
export const ACCESS_LABEL: Record<Access, string> = {
  VIEWERS: "Everyone who can see",
  FOLLOWERS: "Followers",
  SUBSCRIBERS: "Subscribers",
  MEMBERS: "Members",
  NOBODY: "Nobody",
};

type Saved = Partial<Omit<PostSettings, "copies">> & { copies?: number | null };

/** A new post starts open to everyone, with 100 copies; an edit starts from what's saved. */
export function settingsFrom(saved?: Saved | null): PostSettings {
  return {
    audience: saved?.audience ?? "EVERYONE",
    tierId: saved?.tierId ?? null,
    commentAccess: saved?.commentAccess ?? "VIEWERS",
    commentTierId: saved?.commentTierId ?? null,
    collectAccess: saved?.collectAccess ?? "VIEWERS",
    collectTierId: saved?.collectTierId ?? null,
    copies: saved?.copies && saved.copies > 0 ? saved.copies : DEFAULT_COPIES,
  };
}

/** What's missing before the post can be saved, or null. */
export function settingsProblem(settings: PostSettings, collected: number): string | null {
  if (settings.audience === "MEMBERS" && !settings.tierId)
    return "Pick the tier that can see this post.";
  if (settings.commentAccess === "MEMBERS" && !settings.commentTierId)
    return "Pick the tier that can comment.";
  if (settings.collectAccess === "MEMBERS" && !settings.collectTierId)
    return "Pick the tier that can collect.";
  if (!Number.isInteger(settings.copies) || settings.copies < 1 || settings.copies > MAX_COPIES)
    return `Pick between 1 and ${MAX_COPIES.toLocaleString("en-US")} copies.`;
  if (collected > 0 && settings.copies < collected)
    return `Fans have collected ${collected} already, so keep at least ${collected} copies.`;
  return null;
}

/** "Followers · comments: Members · collect: Nobody", for the preview. */
export function settingsSummary(
  settings: PostSettings,
  tierName: (id: string | null) => string,
  hasMedia = true,
) {
  const who = (access: Audience | Access, tierId: string | null) =>
    access === "MEMBERS"
      ? tierName(tierId)
      : access === "VIEWERS"
        ? "everyone who can see"
        : access === "NOBODY"
          ? "off"
          : access === "FOLLOWERS"
            ? "followers"
            : access === "SUBSCRIBERS"
              ? "subscribers"
              : "everyone";
  return {
    see:
      settings.audience === "MEMBERS"
        ? tierName(settings.tierId)
        : AUDIENCE_LABEL[settings.audience],
    comment: who(settings.commentAccess, settings.commentTierId),
    collect: !hasMedia
      ? "needs a photo, video or song"
      : settings.collectAccess === "NOBODY"
        ? "off"
        : `${who(settings.collectAccess, settings.collectTierId)}, ${settings.copies.toLocaleString("en-US")} copies`,
  };
}
