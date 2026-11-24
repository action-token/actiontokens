import type { Metadata } from "next";

import { PageBody } from "@actiontokens/ui/patterns/page-header";

import { MusicHome } from "~/features/music/music-home";
import { SongsHero } from "~/features/songs/songs-hero";
import { serverApi } from "~/server/api";

export const metadata: Metadata = { title: "Music" };

/** The music home. Old `?tab=mine` links still land on My collection → Songs. */
export default async function MusicPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  if ((await searchParams).tab === "mine") {
    const { redirect } = await import("next/navigation");
    redirect("/collection?tab=songs");
  }
  const home = await (await serverApi()).catalog.home();
  return (
    <>
      <SongsHero fallback={home.newMusic.map((song) => ({ ...song, playsThisWeek: null }))} />
      <PageBody wide>
        <MusicHome home={home} />
      </PageBody>
    </>
  );
}
