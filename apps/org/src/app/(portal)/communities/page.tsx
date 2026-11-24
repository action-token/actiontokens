import type { Metadata } from "next";

import { PageBody, PageHeader } from "@actiontokens/ui/patterns/page-header";

import { OrgCommunities } from "~/features/community/org-communities";

export const metadata: Metadata = { title: "Communities" };

export default function CommunitiesPage() {
  return (
    <PageBody className="grid gap-6">
      <PageHeader title="Communities" note="*your crews: start one, run it*" />
      <OrgCommunities />
    </PageBody>
  );
}
