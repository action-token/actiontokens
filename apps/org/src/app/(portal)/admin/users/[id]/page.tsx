import { PersonView } from "~/features/admin/person-view";

export const metadata = { title: "Person" };

export default async function AdminPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PersonView userId={id} />;
}
