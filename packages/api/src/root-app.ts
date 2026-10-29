import { accountRouter } from "./routers/app/account";
import { artistRouter } from "./routers/app/artist";
import { bountyRouter } from "./routers/app/bounty";
import { catalogRouter } from "./routers/app/catalog";
import { collectionRouter } from "./routers/app/collection";
import { itemRouter } from "./routers/app/item";
import { mediaRouter } from "./routers/app/media";
import { musicRouter } from "./routers/app/music";
import { orderRouter } from "./routers/app/order";
import { rechargeRouter } from "./routers/app/recharge";
import { walletRouter } from "./routers/app/wallet";
import { playlistRouter } from "./routers/app/playlist";
import { profileRouter } from "./routers/app/profile";
import { createRouter } from "./trpc";

/** The fan app's API. Each app gets only the routers it uses. */
export const appRouter = createRouter({
  account: accountRouter,
  artist: artistRouter,
  bounty: bountyRouter,
  catalog: catalogRouter,
  collection: collectionRouter,
  item: itemRouter,
  media: mediaRouter,
  music: musicRouter,
  order: orderRouter,
  recharge: rechargeRouter,
  wallet: walletRouter,
  playlist: playlistRouter,
  profile: profileRouter,
});

export type AppRouter = typeof appRouter;
