import { accountRouter } from "./routers/app/account";
import { artistRouter } from "./routers/ar/artist";
import { muralRouter } from "./routers/ar/mural";
import { pinRouter } from "./routers/ar/pin";
import { createRouter } from "./trpc";

/** The AR app's API: the map, collecting and the collection. */
export const arRouter = createRouter({
  account: accountRouter,
  artist: artistRouter,
  mural: muralRouter,
  pin: pinRouter,
});

export type ArRouter = typeof arRouter;
