import { accountRouter } from "./routers/app/account";
import { notificationRouter } from "./routers/app/notification";
import { coinsRouter } from "./routers/studio/coins";
import { agentRouter } from "./routers/artist/agent";
import { generateRouter } from "./routers/studio/generate";
import { musicRouter } from "./routers/studio/music";
import { projectsRouter } from "./routers/studio/projects";
import { createRouter } from "./trpc";

/** The Studio app's API (studio.bandcoin.io): coins, music, and the image, video and writing tools. */
export const studioRouter = createRouter({
  account: accountRouter,
  agent: agentRouter,
  coins: coinsRouter,
  generate: generateRouter,
  music: musicRouter,
  projects: projectsRouter,
  notification: notificationRouter,
});

export type StudioRouter = typeof studioRouter;
