import { HomeFront } from "~/features/home/home-front";
import { HomeView } from "~/features/home/home-view";
import { serverApi } from "~/server/api";

export default async function HomePage() {
  const home = await (await serverApi()).catalog.home();
  return (
    <HomeFront home={home}>
      {(home.trending.length > 0 || home.newMusic.length > 0) && (
        <section className="hm-sec" data-reveal>
          <div className="hm-head">
            <div className="min-w-0">
              <p className="lp-tag">Press play</p>
              <h2 className="lp-sec-title lp-chrome">Hear it</h2>
            </div>
          </div>
          <HomeView home={home} />
        </section>
      )}
    </HomeFront>
  );
}
