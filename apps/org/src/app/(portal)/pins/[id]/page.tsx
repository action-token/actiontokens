import { EditPinView } from "~/features/pins/pin-pages";

export const metadata = { title: "Edit pin" };

export default async function EditPinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditPinView pinId={id} />;
}
