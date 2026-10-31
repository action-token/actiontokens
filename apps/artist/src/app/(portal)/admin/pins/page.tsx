import { Suspense } from "react";

import { PinReviewView } from "~/features/admin/pin-review/pin-review-view";

export const metadata = { title: "Pin review" };

export default function AdminPinsPage() {
  return (
    <Suspense>
      <PinReviewView />
    </Suspense>
  );
}
