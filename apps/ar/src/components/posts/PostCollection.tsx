import {
  Image as ImageIcon,
  type LucideIcon,
  Music,
  Newspaper,
  ScanLine,
  Video,
} from "lucide-react";
import { useRouter } from "~/lib/navigation";

import { ArButton, ArLinkButton } from "~/components/ui/ArButton";
import { CardSkeleton } from "~/components/ui/Skeleton";
import { useAuth } from "~/lib/ar/store";
import { api } from "~/trpc/react";

const KIND_ICON: Partial<Record<string, LucideIcon>> = {
  IMAGE: ImageIcon,
  VIDEO: Video,
  AUDIO: Music,
};

/**
 * ── Collection › Posts ─────────────────────────────────────────────────────
 *
 * Artist posts the fan collected by scanning the QR on the post in the feed,
 * as in bandfan. They live here only, not in the marketplace collection.
 */
export function PostCollection({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const requireAuth = useAuth((s) => s.requireAuth);
  const posts = api.post.collected.useInfiniteQuery(
    {},
    { enabled: signedIn, getNextPageParam: (last) => last.next ?? undefined, staleTime: 30_000 },
  );
  const items = posts.data?.pages.flatMap((page) => page.items) ?? [];
  const total = posts.data?.pages[0]?.total ?? 0;

  if (!signedIn)
    return (
      <div className="mx-5 mt-6 text-center">
        <Newspaper size={30} strokeWidth={1.7} className="text-ar-accent-hot mx-auto" />
        <p className="font-hud text-ar-text mt-3 text-[15px] font-bold">
          Posts you collect live here
        </p>
        <p className="text-ar-dim mx-auto mt-1.5 max-w-[17rem] text-[12px] leading-relaxed">
          Scan the QR on an artist&apos;s post to keep a free copy.
        </p>
        <ArButton
          variant="primary"
          size="md"
          className="mt-4"
          onClick={() => requireAuth("collect")}
        >
          Sign in
        </ArButton>
      </div>
    );

  return (
    <div className="ar-scroll flex-1 px-5 pb-6">
      <div className="mb-2.5 flex items-baseline justify-between">
        <p className="font-hud text-ar-dim text-[11px] font-bold tracking-[0.14em] uppercase">
          {total > 0 ? `${total} post${total === 1 ? "" : "s"}` : "Posts"}
        </p>
        <a
          href="/scan"
          className="font-hud text-ar-accent-hot flex items-center gap-1 text-[11px] font-bold tracking-[0.12em] uppercase"
        >
          <ScanLine size={12} strokeWidth={2.6} /> Scan
        </a>
      </div>

      {posts.isLoading ? (
        <div className="grid grid-cols-2 gap-3.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-ar border-ar-line mt-6 border border-dashed px-6 py-8 text-center">
          <Newspaper size={28} strokeWidth={1.7} className="text-ar-accent-hot mx-auto" />
          <p className="font-hud text-ar-text mt-3 text-[14px] font-bold">No posts yet</p>
          <p className="text-ar-dim mx-auto mt-1.5 max-w-[16rem] text-[12px] leading-relaxed">
            Artists&apos; posts in the feed carry a &ldquo;Scan to collect&rdquo; code. Scan it to
            keep a free copy, one each while they last.
          </p>
          <ArLinkButton href="/scan" variant="primary" size="md" icon={ScanLine} className="mt-4">
            Open the scanner
          </ArLinkButton>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3.5">
            {items.map((item) => (
              <button
                key={item.postId}
                onClick={() => void router.push(`/collection/post/${item.postId}`)}
                className="group text-left"
              >
                <span className="border-ar-accent/60 bg-ar-surface relative block aspect-[4/5] overflow-hidden rounded-[14px] border-2">
                  {item.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element -- artist uploads
                    <img
                      src={item.cover}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                    />
                  ) : (
                    <span className="grid h-full place-items-center">
                      <Newspaper size={30} className="text-ar-faint" />
                    </span>
                  )}
                  {item.kinds.length > 0 && (
                    <span className="bg-ar-void/80 text-ar-text absolute right-1.5 bottom-1.5 flex gap-1 rounded-full px-1.5 py-1">
                      {item.kinds.map((kind) => {
                        const Icon = KIND_ICON[kind];
                        return Icon ? <Icon key={kind} size={11} strokeWidth={2.4} /> : null;
                      })}
                    </span>
                  )}
                </span>
                <span className="text-ar-text mt-1.5 block truncate text-[12.5px] font-semibold">
                  {item.title}
                </span>
                <span className="text-ar-faint block truncate text-[10.5px]">
                  {item.artist.name}
                </span>
              </button>
            ))}
          </div>
          {posts.hasNextPage && (
            <div className="mt-5 flex justify-center">
              <ArButton
                variant="outline"
                size="md"
                disabled={posts.isFetchingNextPage}
                onClick={() => void posts.fetchNextPage()}
              >
                {posts.isFetchingNextPage ? "Loading…" : "Show more"}
              </ArButton>
            </div>
          )}
        </>
      )}
    </div>
  );
}
