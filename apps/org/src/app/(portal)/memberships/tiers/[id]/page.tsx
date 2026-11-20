import { EditTierView } from "~/features/memberships/tier-pages";

export const metadata = { title: "Edit tier" };

export default async function EditTierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditTierView tierId={id} />;
}
