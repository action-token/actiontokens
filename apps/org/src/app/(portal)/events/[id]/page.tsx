import { EditEventView } from "~/features/engage/event-pages";

export const metadata = { title: "Edit event" };

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditEventView eventId={id} />;
}
