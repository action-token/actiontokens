import { accountRouter } from "./routers/app/account";
import { artistRouter } from "./routers/app/artist";
import { catalogRouter } from "./routers/app/catalog";
import { itemRouter } from "./routers/app/item";
import { mediaRouter } from "./routers/app/media";
import { musicRouter } from "./routers/app/music";
import { orderRouter } from "./routers/app/order";
import { createRouter } from "./trpc";

/** The fan app's API. Each app gets only the routers it uses. */
export const appRouter = createRouter({
  account: accountRouter,
  artist: artistRouter,
  catalog: catalogRouter,
  item: itemRouter,
  media: mediaRouter,
  music: musicRouter,
  order: orderRouter,
});

export type AppRouter = typeof appRouter;
