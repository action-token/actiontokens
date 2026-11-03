"use client";

import { BadgeCheck, Music, Newspaper } from "lucide-react";

import { AppShell, ScreenHeader } from "~/components/shell/AppShell";
import { ArLinkButton } from "~/components/ui/ArButton";
import { Skeleton, SkeletonText } from "~/components/ui/Skeleton";
import { useAuth } from "~/lib/ar/store";
import { useQueryParams } from "~/lib/navigation";
import { api } from "~/trpc/react";

const dateFmt = (value: Date | string | null) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

/**
 * ── /collection/post/[id] ──────────────────────────────────────────────────
 *
 * A post the fan collected by scanning its QR: which copy they hold, then the
 * whole post: words, photos, videos and songs.
 */
export default function CollectedPostScreen() {
  const { query } = useQueryParams();
  const postId = typeof query.id === "string" ? query.id : "";
  const signedIn = useAuth((s) => Boolean(s.user));
  const post = api.post.collectedOne.useQuery(
    { postId },
    { enabled: signedIn && Boolean(postId), retry: false },
  );
  const data = post.data;

  return (
    <AppShell>
      <div className="flex h-full flex-col">
        <ScreenHeader back eyebrow="Collected post" title={data?.title ?? "Post"} />
        <div className="ar-scroll flex-1 px-5 pb-8">
          {!signedIn ? (
            <Empty text="Sign in to see the posts you've collected." />
          ) : post.isLoading ? (
            <div className="grid gap-3">
              <Skeleton className="aspect-[4/5] w-full rounded-[14px]" />
              <SkeletonText lines={3} />
            </div>
          ) : !data ? (
            <Empty text={post.error?.message ?? "This post isn't in your collection."} />
          ) : (
            <article className="grid gap-4">
              <div className="rounded-ar border-ar-accent/50 bg-ar-accent/10 flex items-center gap-3 border px-4 py-3">
                <BadgeCheck size={20} strokeWidth={2.3} className="text-ar-accent-hot shrink-0" />
                <div className="min-w-0">
                  <p className="font-hud text-ar-accent-hot text-[13px] font-bold tracking-[0.08em] uppercase">
                    Copy #{data.copy.number} of {data.copy.total}
                  </p>
                  <p className="text-ar-dim text-[11.5px]">Collected {dateFmt(data.collectedAt)}</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                {data.artist.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- artist upload
                  <img
                    src={data.artist.avatarUrl}
                    alt=""
                    className="size-9 rounded-full object-cover"
                  />
                ) : (
                  <span className="bg-ar-surface size-9 rounded-full" />
                )}
                <div className="min-w-0">
                  <p className="text-ar-text truncate text-[13.5px] font-semibold">
                    {data.artist.name}
                  </p>
                  <p className="text-ar-faint text-[11px]">Posted {dateFmt(data.createdAt)}</p>
                </div>
              </div>

              {data.body && (
                <p className="text-ar-text text-[14px] leading-relaxed whitespace-pre-line">
                  {data.body}
                </p>
              )}

              {data.media.map((file) =>
                file.type === "IMAGE" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- artist upload
                  <img
                    key={file.id}
                    src={file.url}
                    alt={file.title ?? ""}
                    loading="lazy"
                    className="border-ar-line w-full rounded-[14px] border object-cover"
                  />
                ) : file.type === "VIDEO" ? (
                  <video
                    key={file.id}
                    src={file.url}
                    poster={file.thumbnailUrl ?? undefined}
                    controls
                    playsInline
                    preload="metadata"
                    className="border-ar-line aspect-video w-full rounded-[14px] border bg-black"
                  />
                ) : (
                  <div key={file.id} className="ar-glass rounded-ar grid gap-2 p-3">
                    <p className="text-ar-text flex items-center gap-2 text-[13px] font-semibold">
                      <Music size={15} className="text-ar-accent-hot shrink-0" />
                      <span className="truncate">{file.title ?? "Song"}</span>
                    </p>
                    <audio src={file.url} controls preload="none" className="w-full" />
                  </div>
                ),
              )}
            </article>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-ar border-ar-line mt-6 border border-dashed px-6 py-8 text-center">
      <Newspaper size={28} strokeWidth={1.7} className="text-ar-accent-hot mx-auto" />
      <p className="text-ar-dim mx-auto mt-3 max-w-[16rem] text-[12.5px] leading-relaxed">{text}</p>
      <ArLinkButton href="/collection?tab=posts" variant="outline" size="md" className="mt-4">
        Your posts
      </ArLinkButton>
    </div>
  );
}
