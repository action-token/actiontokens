import { Suspense } from "react";

import { RedeemView } from "~/features/redeem/redeem-view";

export const metadata = { title: "Redeem" };

export default function RedeemPage() {
  return (
    <Suspense>
      <RedeemView />
    </Suspense>
  );
}
