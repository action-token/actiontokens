import { Suspense } from "react";

import { EmbedEditor } from "~/features/embeds/embed-editor";

export const metadata = { title: "Website map editor" };

export default async function EmbedEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <EmbedEditor id={id} />
    </Suspense>
  );
}
