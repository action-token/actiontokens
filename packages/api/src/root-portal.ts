import { accountRouter } from "./routers/app/account";
import { adminRouter } from "./routers/admin";
import { aiRouter } from "./routers/artist/ai";
import { bountiesRouter } from "./routers/artist/bounties";
import { catalogRouter } from "./routers/artist/catalog";
import { embedsRouter } from "./routers/artist/embeds";
import { engageRouter } from "./routers/artist/engage";
import { giftsRouter } from "./routers/artist/gifts";
import { membershipsRouter } from "./routers/artist/memberships";
import { musicRouter } from "./routers/artist/music";
import { onboardingRouter } from "./routers/artist/onboarding";
import { pageRouter } from "./routers/artist/page";
import { pinsRouter } from "./routers/artist/pins";
import { redeemRouter } from "./routers/artist/redeem";
import { postsRouter } from "./routers/artist/posts";
import { reportsRouter } from "./routers/artist/reports";
import { profileRouter } from "./routers/artist/profile";
import { royaltyRouter } from "./routers/artist/royalty";
import { vanityRouter } from "./routers/artist/vanity";
import { portalStatusRouter } from "./routers/artist/portal";
import { createRouter } from "./trpc";

/** The artist portal's API (artist.bandcoin.io, including /admin). */
export const portalRouter = createRouter({
  account: accountRouter,
  portal: portalStatusRouter,
  onboarding: onboardingRouter,
  admin: adminRouter,
  catalog: catalogRouter,
  music: musicRouter,
  memberships: membershipsRouter,
  engage: engageRouter,
  ai: aiRouter,
  bounties: bountiesRouter,
  pins: pinsRouter,
  embeds: embedsRouter,
  page: pageRouter,
  posts: postsRouter,
  gifts: giftsRouter,
  reports: reportsRouter,
  redeem: redeemRouter,
  profile: profileRouter,
  royalty: royaltyRouter,
  vanity: vanityRouter,
});

export type PortalRouter = typeof portalRouter;
