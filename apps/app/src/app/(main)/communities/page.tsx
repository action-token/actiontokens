import type { Metadata } from "next";

import { PageBody, PageHeader } from "@actiontokens/ui/patterns/page-header";

import { CommunitiesView } from "~/features/community/communities-view";

export const metadata: Metadata = {
  title: "Communities",
  description: "Token-gated crews: hold the token, get in the room.",
};

export default function CommunitiesPage() {
  return (
    <PageBody className="grid gap-6">
      <PageHeader title="Communities" note="*hold the token, get in the room*" />
      <CommunitiesView />
    </PageBody>
  );
}
