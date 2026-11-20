import { EditPostView } from "~/features/posts/post-pages";

export const metadata = { title: "Edit post" };

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditPostView postId={id} />;
}
