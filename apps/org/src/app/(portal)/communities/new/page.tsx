import type { Metadata } from "next";

import { PageBody, PageHeader } from "@actiontokens/ui/patterns/page-header";

import { CommunityForm } from "~/features/community/community-form";

export const metadata: Metadata = { title: "New community" };

export default function NewCommunityPage() {
  return (
    <PageBody className="grid gap-6">
      <PageHeader
        title="Start a crew"
        note="*pick a token, set the gate*"
        back={{ href: "/communities", label: "Communities" }}
      />
      <CommunityForm />
    </PageBody>
  );
}
