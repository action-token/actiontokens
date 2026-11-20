import { EditHotspotView } from "~/features/hotspots/hotspot-pages";

export const metadata = { title: "Edit hotspot" };

export default async function EditHotspotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditHotspotView hotspotId={id} />;
}
