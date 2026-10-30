"use client";

import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { PageBody } from "@bandcoin/ui/patterns/page-header";

import { usePortal } from "~/features/portal/use-portal";

/** Admin pages only render for admins; other signed-in people get a plain explanation and a way back. The API enforces it too. */
export function AdminGate({ children }: { children: ReactNode }) {
  const portal = usePortal();
  if (portal.loading) {
    return (
      <PageBody>
        <Skeleton className="h-9 w-48" />
        <Skeleton className="mt-6 h-40 w-full rounded-xl" />
      </PageBody>
    );
  }
  if (!portal.isAdmin) {
    return (
      <PageBody>
        <EmptyState
          icon={ShieldAlert}
          title="Admins only"
          description="This area is for Bandcoin admins. Your account doesn't have admin access."
          action={
            <Button asChild variant="outline">
              <Link href="/">Back to your portal</Link>
            </Button>
          }
        />
      </PageBody>
    );
  }
  return children;
}
