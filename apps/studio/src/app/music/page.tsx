import { Suspense } from "react";

import { MusicView } from "~/features/music/music-view";

export const metadata = { title: "Music" };

export default function MusicPage() {
  return (
    <Suspense>
      <MusicView />
    </Suspense>
  );
}
