"use client";

import { Plus, Users } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";

import { Button } from "@actiontokens/ui/components/button";
import { Skeleton } from "@actiontokens/ui/components/skeleton";

import { api, type RouterOutputs } from "~/trpc/react";

import { compact } from "./parts";

/**
 * The organization's communities (crews): the ones it runs, to open and manage (edit, invite,
 * members, posts, delete), and the ones it has joined. Create starts a new one. The same
 * communities fans see and join in the marketplace.
 */
export function OrgCommunities() {
  const me = useSession().data?.user?.id;
  const mine = api.community.mine.useQuery();
  const rows = mine.data ?? [];
  const running = rows.filter((community) => community.ownerId === me);
  const joined = rows.filter((community) => community.ownerId !== me);

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-fg-muted max-w-xl text-sm text-pretty">
          Token-gated crews for your fans: pick a token, set the gate, post to members. They show up
          in the marketplace for fans to find and join.
        </p>
        <Button asChild>
          <Link href="/communities/new">
            <Plus /> Create community
          </Link>
        </Button>
      </div>

      {mine.isPending ? (
        <div className="cm-grid">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-24 rounded-3xl" />
          ))}
        </div>
      ) : (
        <>
          <Section title="You run" count={running.length}>
            {running.length === 0 ? (
              <div className="cm-empty">
                <span className="cm-empty-icon">
                  <Users className="size-6" />
                </span>
                <p className="font-display text-2xl font-semibold uppercase">No communities yet</p>
                <p className="text-fg-muted text-sm">
                  Start your first crew and invite your fans in.
                </p>
              </div>
            ) : (
              <Rows rows={running} />
            )}
          </Section>
          {joined.length > 0 && (
            <Section title="You're in" count={joined.length}>
              <Rows rows={joined} />
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-3">
      <h2 className="font-display flex items-baseline gap-2 text-2xl font-semibold uppercase">
        {title} <span className="text-fg-faint num text-base">{count}</span>
      </h2>
      {children}
    </section>
  );
}

type Row = RouterOutputs["community"]["mine"][number];

function Rows({ rows }: { rows: Row[] }) {
  return (
    <div className="cm-grid">
      {rows.map((community) => (
        <Link key={community.id} href={`/communities/${community.id}`} className="cm-mine">
          <span className="cm-card-pic cm-card-pic--small">
            {community.profileUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- pictures come from storage
              <img src={community.profileUrl} alt="" />
            ) : (
              <Users className="size-5" />
            )}
          </span>
          <span className="min-w-0">
            <span className="cm-card-title">{community.title}</span>
            <span className="text-fg-muted block text-xs">
              {compact(community._count.members)} members · {compact(community._count.posts)} posts
              {community.hiddenAt && " · hidden by the admins"}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
