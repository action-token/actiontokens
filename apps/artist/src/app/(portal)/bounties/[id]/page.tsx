import { BountyManage } from "~/features/bounties/bounty-manage";

export const metadata = { title: "Bounty" };

export default async function BountyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BountyManage bountyId={id} />;
}
