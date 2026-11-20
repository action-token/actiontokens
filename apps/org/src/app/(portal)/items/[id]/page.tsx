import { EditItemView } from "~/features/catalog/item-pages";

export const metadata = { title: "Edit item" };

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditItemView itemId={id} />;
}
