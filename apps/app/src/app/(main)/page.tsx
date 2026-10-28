import { PageBody } from "@bandcoin/ui/patterns/page-header";

import { HomeView } from "~/features/home/home-view";
import { serverApi } from "~/server/api";

export default async function HomePage() {
  const home = await (await serverApi()).catalog.home();
  return (
    <PageBody wide>
      <HomeView home={home} />
    </PageBody>
  );
}
