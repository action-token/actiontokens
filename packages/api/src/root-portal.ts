import { accountRouter } from "./routers/app/account";
import { portalStatusRouter } from "./routers/artist/portal";
import { createRouter } from "./trpc";

/** The artist portal's API (artist.bandcoin.io, including /admin). */
export const portalRouter = createRouter({
  account: accountRouter,
  portal: portalStatusRouter,
});

export type PortalRouter = typeof portalRouter;
