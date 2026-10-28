import { accountRouter } from "./routers/app/account";
import { orderRouter } from "./routers/app/order";
import { createRouter } from "./trpc";

/** The fan app's API. Each app gets only the routers it uses. */
export const appRouter = createRouter({
  account: accountRouter,
  order: orderRouter,
});

export type AppRouter = typeof appRouter;
