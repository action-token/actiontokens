import { Suspense } from "react";

import { NewPinView } from "~/features/pins/pin-pages";

export const metadata = { title: "New pin" };

export default function NewPinPage() {
  // The form reads the map click (?lat=&lng=) from the address.
  return (
    <Suspense>
      <NewPinView />
    </Suspense>
  );
}
