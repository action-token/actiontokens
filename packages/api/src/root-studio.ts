import { accountRouter } from "./routers/app/account";
import { notificationRouter } from "./routers/app/notification";
import { coinsRouter } from "./routers/studio/coins";
import { musicRouter } from "./routers/studio/music";
import { createRouter } from "./trpc";

/** The Studio app's API (studio.bandcoin.io): coins now, generators in stage 6. */
export const studioRouter = createRouter({
  account: accountRouter,
  coins: coinsRouter,
  music: musicRouter,
  notification: notificationRouter,
});

export type StudioRouter = typeof studioRouter;
