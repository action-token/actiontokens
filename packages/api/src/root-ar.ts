import { accountRouter } from "./routers/app/account";
import { artistRouter } from "./routers/ar/artist";
import { claimRouter } from "./routers/ar/claim";
import { muralRouter } from "./routers/ar/mural";
import { pinRouter } from "./routers/ar/pin";
import { createRouter } from "./trpc";

/** The AR app's API: the map, collecting and the collection. */
export const arRouter = createRouter({
  account: accountRouter,
  artist: artistRouter,
  claim: claimRouter,
  mural: muralRouter,
  pin: pinRouter,
});

export type ArRouter = typeof arRouter;
