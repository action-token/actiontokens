import { createRouter, publicProcedure } from "../../trpc";

/** Where an applicant is, in plain steps: pay to open the issuer, wait for an admin, ready, rejected (can apply again) or banned. */
export type OnboardingStep =
  "OPEN_ISSUER" | "WAITING_FOR_APPROVAL" | "READY" | "BANNED" | "REJECTED";

function stepOf(artist: { status: string; issuerAccountId: string | null }): OnboardingStep {
  if (artist.status === "BANNED") return "BANNED";
  if (artist.status === "REJECTED") return "REJECTED";
  if (artist.status === "APPROVED") return "READY";
  return artist.issuerAccountId ? "WAITING_FOR_APPROVAL" : "OPEN_ISSUER";
}

export const portalStatusRouter = createRouter({
  /**
   * Who is signed in and how far they are as an artist. Open to everyone, so the
   * portal can show its sign-in instead of an error page.
   */
  status: publicProcedure.query(async ({ ctx }) => {
    const user = ctx.session?.user;
    if (!user) return { signedIn: false as const };
    const artist = await ctx.db.artist.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        issuerAccountId: true,
        rejectionReason: true,
      },
    });
    const step = artist ? stepOf(artist) : null;
    return {
      signedIn: true as const,
      isAdmin: user.role === "ADMIN",
      artist:
        artist && step
          ? {
              id: artist.id,
              name: artist.name,
              slug: artist.slug,
              status: artist.status,
              step,
              rejectionReason: artist.rejectionReason,
            }
          : null,
    };
  }),
});
