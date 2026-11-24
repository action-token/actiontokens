import { HomeFront } from "~/features/home/home-front";
import { serverApi } from "~/server/api";

/** The home page. The music (recently played, trending, every song…) lives on /music. */
export default async function HomePage() {
  const home = await (await serverApi()).catalog.home();
  return <HomeFront home={home} />;
}
