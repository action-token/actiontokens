"use client";

import { useState } from "react";

import { Button } from "@actiontokens/ui/components/button";
import { PageBody, PageHeader } from "@actiontokens/ui/patterns/page-header";

import { ActivityList } from "./activity-list";

/** Every change made on the platform, newest first: who, what, on what, and whether it worked. */
export function ActivityView() {
  const [failedOnly, setFailedOnly] = useState(false);

  return (
    <PageBody className="grid gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Activity"
        description="Every change on Bandcoin, from every app."
        actions={
          <Button
            variant={failedOnly ? "default" : "secondary"}
            size="sm"
            onClick={() => setFailedOnly((value) => !value)}
            aria-pressed={failedOnly}
          >
            Failed only
          </Button>
        }
      />
      <ActivityList
        filter={{ limit: 50, failedOnly: failedOnly || undefined }}
        emptyText={failedOnly ? "No failed actions." : "Changes will show up here as they happen."}
      />
    </PageBody>
  );
}
