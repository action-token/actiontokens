import { accountRouter } from "./routers/app/account";
import { activationRouter } from "./routers/app/activation";
import { rechargeRouter } from "./routers/app/recharge";
import { adminRouter } from "./routers/admin";
import { agentRouter } from "./routers/artist/agent";
import { aiRouter } from "./routers/artist/ai";
import { facebookRouter } from "./routers/artist/facebook";
import { mcpTokensRouter } from "./routers/artist/mcp-tokens";
import { bountiesRouter } from "./routers/artist/bounties";
import { catalogRouter } from "./routers/artist/catalog";
import { embedsRouter } from "./routers/artist/embeds";
import { engageRouter } from "./routers/artist/engage";
import { giftsRouter } from "./routers/artist/gifts";
import { hotspotsRouter } from "./routers/artist/hotspots";
import { membershipsRouter } from "./routers/artist/memberships";
import { musicRouter } from "./routers/artist/music";
import { notificationsRouter } from "./routers/artist/notifications";
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
  notifications: notificationsRouter,
  hotspots: hotspotsRouter,
  account: accountRouter,
  /** Recharge and wallet activation, the same as the fan app's (one account, one flow) */
  recharge: rechargeRouter,
  activation: activationRouter,
  portal: portalStatusRouter,
  onboarding: onboardingRouter,
  admin: adminRouter,
  catalog: catalogRouter,
  music: musicRouter,
  memberships: membershipsRouter,
  engage: engageRouter,
  agent: agentRouter,
  ai: aiRouter,
  facebook: facebookRouter,
  mcpTokens: mcpTokensRouter,
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
