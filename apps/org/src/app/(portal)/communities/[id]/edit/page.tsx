import type { Metadata } from "next";

import { PageBody, PageHeader } from "@actiontokens/ui/patterns/page-header";

import { EditCommunity } from "~/features/community/community-form";

export const metadata: Metadata = { title: "Edit community" };

export default async function EditCommunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PageBody className="grid gap-6">
      <PageHeader title="Edit crew" back={{ href: `/communities/${id}`, label: "Back" }} />
      <EditCommunity id={id} />
    </PageBody>
  );
}
