import { Suspense } from "react";

import { MuralsView } from "~/features/admin/murals/murals-view";

export const metadata = { title: "Mural review" };

export default function AdminMuralsPage() {
  return (
    <Suspense>
      <MuralsView />
    </Suspense>
  );
}
