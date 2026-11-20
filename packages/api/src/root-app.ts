import { accountRouter } from "./routers/app/account";
import { artistRouter } from "./routers/app/artist";
import { eventRouter } from "./routers/app/event";
import { storyRouter } from "./routers/app/story";
import { notificationRouter } from "./routers/app/notification";
import { bountyRouter } from "./routers/app/bounty";
import { communitiesRouter } from "./routers/app/community";
import { rewardRouter } from "./routers/app/reward";
import { catalogRouter } from "./routers/app/catalog";
import { collectionRouter } from "./routers/app/collection";
import { itemRouter } from "./routers/app/item";
import { mediaRouter } from "./routers/app/media";
import { musicRouter } from "./routers/app/music";
import { activationRouter } from "./routers/app/activation";
import { orderRouter } from "./routers/app/order";
import { rechargeRouter } from "./routers/app/recharge";
import { walletRouter } from "./routers/app/wallet";
import { playlistRouter } from "./routers/app/playlist";
import { postRouter } from "./routers/app/post";
import { profileRouter } from "./routers/app/profile";
import { reactionRouter } from "./routers/app/reaction";
import { resaleRouter } from "./routers/app/resale";
import { searchRouter } from "./routers/app/search";
import { createRouter } from "./trpc";

/** The fan app's API. Each app gets only the routers it uses. */
export const appRouter = createRouter({
  account: accountRouter,
  artist: artistRouter,
  bounty: bountyRouter,
  community: communitiesRouter,
  reward: rewardRouter,
  event: eventRouter,
  story: storyRouter,
  notification: notificationRouter,
  catalog: catalogRouter,
  collection: collectionRouter,
  item: itemRouter,
  media: mediaRouter,
  music: musicRouter,
  activation: activationRouter,
  order: orderRouter,
  recharge: rechargeRouter,
  wallet: walletRouter,
  playlist: playlistRouter,
  post: postRouter,
  profile: profileRouter,
  reaction: reactionRouter,
  resale: resaleRouter,
  search: searchRouter,
});

export type AppRouter = typeof appRouter;
