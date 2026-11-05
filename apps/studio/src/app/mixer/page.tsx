import { Suspense } from "react";

import { MixerView } from "~/features/mixer/mixer-view";

export const metadata = { title: "Mixer" };

export default function MixerPage() {
  return (
    <Suspense>
      <MixerView />
    </Suspense>
  );
}
