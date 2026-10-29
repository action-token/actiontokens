import { accountRouter } from "./routers/app/account";
import { adminRouter } from "./routers/admin";
import { catalogRouter } from "./routers/artist/catalog";
import { membershipsRouter } from "./routers/artist/memberships";
import { musicRouter } from "./routers/artist/music";
import { onboardingRouter } from "./routers/artist/onboarding";
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
});

export type PortalRouter = typeof portalRouter;
