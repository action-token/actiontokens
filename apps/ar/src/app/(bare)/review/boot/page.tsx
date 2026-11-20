import type { Metadata } from "next";

import { BootReview } from "./BootReview";

export const metadata: Metadata = { title: "Boot review", robots: { index: false } };

/** Boot screen review: four looping concepts in phone frames. The owner picks one. */
export default function BootReviewPage() {
  return <BootReview />;
}
