import { Compass } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@bandcoin/ui/components/button";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";

export const metadata: Metadata = { title: "This link has moved" };

/** Where an old link lands when what it pointed at wasn't carried over or is gone. */
export default function MovedPage() {
  return (
    <EmptyState
      icon={Compass}
      title="This link has moved"
      description="Bandcoin has a new home, and we couldn't find what this old link pointed to. It may have been removed. Try the marketplace or search for the artist."
      action={
        <Button asChild>
          <Link href="/marketplace">Browse the marketplace</Link>
        </Button>
      }
    />
  );
}
