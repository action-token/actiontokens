import { Suspense } from "react";

import { MapsView } from "~/features/admin/maps-view";

export const metadata = { title: "All maps" };

export default function AdminMapsPage() {
  return (
    <Suspense>
      <MapsView />
    </Suspense>
  );
}
