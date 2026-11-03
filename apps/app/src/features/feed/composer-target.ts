import { ARTIST_URL } from "../shell/nav";

/** Where the box leads, and what it says, for who is looking. */
export function composerTarget(
  signedIn: boolean,
  artist: { name: string; status: string } | null,
  displayName: string | null,
) {
  const portal = ARTIST_URL.replace(/\/$/, "");
  if (!signedIn)
    return { href: null, prompt: "Share something with your fans…", action: "Sign in" };
  if (artist?.status === "APPROVED")
    return {
      href: `${portal}/posts/new`,
      prompt: `What's on your mind, ${artist.name}?`,
      action: "Post",
    };
  if (artist)
    return {
      href: portal,
      prompt: "Your artist page is in review. You can post once it's approved.",
      action: "Artist portal",
    };
  return {
    href: portal,
    prompt: `What's on your mind${displayName ? `, ${displayName}` : ""}? Become an artist to post.`,
    action: "Become an artist",
  };
}
