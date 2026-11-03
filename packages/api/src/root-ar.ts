import { accountRouter } from "./routers/app/account";
import { bountyRouter } from "./routers/app/bounty";
import { artistRouter } from "./routers/ar/artist";
import { claimRouter } from "./routers/ar/claim";
import { coinRouter } from "./routers/ar/coin";
import { eventRouter } from "./routers/ar/event";
import { muralRouter } from "./routers/ar/mural";
import { pinRouter } from "./routers/ar/pin";
import { arPostRouter } from "./routers/ar/post";
import { createRouter } from "./trpc";

/** The AR app's API: the map, collecting, the collection and bounties (the fan app's router). */
export const arRouter = createRouter({
  account: accountRouter,
  artist: artistRouter,
  bounty: bountyRouter,
  claim: claimRouter,
  coin: coinRouter,
  event: eventRouter,
  mural: muralRouter,
  pin: pinRouter,
  post: arPostRouter,
});

export type ArRouter = typeof arRouter;
