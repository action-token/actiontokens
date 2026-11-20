import { PageBody } from "@actiontokens/ui/patterns/page-header";

import { Hero } from "~/features/home/hero";
import { HomeView } from "~/features/home/home-view";
import { serverApi } from "~/server/api";

export default async function HomePage() {
  const home = await (await serverApi()).catalog.home();
  return (
    <>
      <Hero items={home.hero} />
      <PageBody wide>
        <HomeView home={home} />
      </PageBody>
    </>
  );
}
