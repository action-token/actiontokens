import type { Metadata } from "next";

import { PageBody } from "@actiontokens/ui/patterns/page-header";

import { CommunityView } from "~/features/community/community-view";

export const metadata: Metadata = { title: "Community" };

export default async function CommunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PageBody>
      <CommunityView id={id} />
    </PageBody>
  );
}
