import { accountRouter } from "./routers/app/account";
import { adminRouter } from "./routers/admin";
import { aiRouter } from "./routers/artist/ai";
import { bountiesRouter } from "./routers/artist/bounties";
import { catalogRouter } from "./routers/artist/catalog";
import { embedsRouter } from "./routers/artist/embeds";
import { engageRouter } from "./routers/artist/engage";
import { membershipsRouter } from "./routers/artist/memberships";
import { musicRouter } from "./routers/artist/music";
import { onboardingRouter } from "./routers/artist/onboarding";
import { pinsRouter } from "./routers/artist/pins";
import { reportsRouter } from "./routers/artist/reports";
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
  reports: reportsRouter,
});

export type PortalRouter = typeof portalRouter;
