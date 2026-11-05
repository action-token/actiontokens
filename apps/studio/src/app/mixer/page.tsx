import { Suspense } from "react";

import { MixerView } from "~/features/mixer/mixer-view";

export const metadata = { title: "Mixer" };

export default function MixerPage() {
  return (
    <div className="mx-auto max-w-[1800px] px-4 py-6 sm:px-8">
      <Suspense>
        <MixerView />
      </Suspense>
    </div>
  );
}
