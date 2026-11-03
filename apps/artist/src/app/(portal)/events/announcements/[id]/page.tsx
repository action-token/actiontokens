import { EditAnnouncementView } from "~/features/engage/announcement-pages";

export const metadata = { title: "Edit announcement" };

export default async function EditAnnouncementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditAnnouncementView announcementId={id} />;
}
