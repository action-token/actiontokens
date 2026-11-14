import { accountRouter } from "./routers/app/account";
import { bountyRouter } from "./routers/app/bounty";
import { catalogRouter } from "./routers/app/catalog";
import { itemRouter } from "./routers/app/item";
import { notificationRouter } from "./routers/app/notification";
import { artistRouter } from "./routers/ar/artist";
import { claimRouter } from "./routers/ar/claim";
import { coinRouter } from "./routers/ar/coin";
import { eventRouter } from "./routers/ar/event";
import { muralRouter } from "./routers/ar/mural";
import { pinRouter } from "./routers/ar/pin";
import { arPostRouter } from "./routers/ar/post";
import { subscribeRouter } from "./routers/ar/subscribe";
import { createRouter } from "./trpc";

/** The AR app's API: the map, collecting, the collection, bounties and the marketplace to browse (the fan app's routers). */
export const arRouter = createRouter({
  account: accountRouter,
  artist: artistRouter,
  bounty: bountyRouter,
  catalog: catalogRouter,
  claim: claimRouter,
  coin: coinRouter,
  event: eventRouter,
  item: itemRouter,
  mural: muralRouter,
  notification: notificationRouter,
  pin: pinRouter,
  post: arPostRouter,
  subscribe: subscribeRouter,
});

export type ArRouter = typeof arRouter;
