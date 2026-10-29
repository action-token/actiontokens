import { createRouter, publicProcedure } from "../../trpc";

/** Where an applicant is, in plain steps: pay to open the issuer, wait for an admin, ready, or banned. */
export type OnboardingStep = "OPEN_ISSUER" | "WAITING_FOR_APPROVAL" | "READY" | "BANNED";

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
      select: { id: true, name: true, slug: true, status: true, issuerAccountId: true },
    });
    const step: OnboardingStep | null = !artist
      ? null
      : artist.status === "BANNED"
        ? "BANNED"
        : artist.status === "APPROVED"
          ? "READY"
          : artist.issuerAccountId
            ? "WAITING_FOR_APPROVAL"
            : "OPEN_ISSUER";
    return {
      signedIn: true as const,
      isAdmin: user.role === "ADMIN",
      artist: artist && step ? { id: artist.id, name: artist.name, slug: artist.slug, status: artist.status, step } : null,
    };
  }),
});
