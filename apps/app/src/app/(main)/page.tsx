import { HomeFront } from "~/features/home/home-front";
import { HomeView } from "~/features/home/home-view";
import { serverApi } from "~/server/api";

export default async function HomePage() {
  const home = await (await serverApi()).catalog.home();
  return (
    <HomeFront home={home}>
      {(home.trending.length > 0 || home.newMusic.length > 0) && (
        <section className="hm-sec" aria-label="Music" data-reveal>
          <HomeView home={home} />
        </section>
      )}
    </HomeFront>
  );
}
