import { EditBountyView } from "~/features/bounties/bounty-pages";

export const metadata = { title: "Edit bounty" };

export default async function EditBountyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditBountyView bountyId={id} />;
}
