import type { Metadata } from "next";

import { PageBody } from "@bandcoin/ui/patterns/page-header";

import { PostPage } from "~/features/feed/post-page";

export const metadata: Metadata = { title: "Post" };

export default async function FeedPostPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  return (
    <PageBody className="grid max-w-2xl gap-4">
      <h1 className="sr-only">Post</h1>
      <PostPage postId={postId} />
    </PageBody>
  );
}
