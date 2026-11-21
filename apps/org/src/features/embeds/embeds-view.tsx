"use client";

import {
  Code2,
  Copy,
  CopyPlus,
  Eye,
  Globe,
  MoreVertical,
  MousePointerClick,
  Pencil,
  Plus,
  Power,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";

import { scriptSnippet } from "@actiontokens/ar-core/embed/snippets";
import { Badge } from "@actiontokens/ui/components/badge";
import { Button } from "@actiontokens/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@actiontokens/ui/components/dropdown-menu";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { cn } from "@actiontokens/ui/lib/cn";
import { ConfirmDialog } from "@actiontokens/ui/patterns/confirm-dialog";
import { EmptyState } from "@actiontokens/ui/patterns/empty-state";
import { ErrorState } from "@actiontokens/ui/patterns/error-state";
import { PageBody, PageHeader } from "@actiontokens/ui/patterns/page-header";

import { api, type RouterOutputs } from "~/trpc/react";

type Embed = RouterOutputs["embeds"]["embeds"][number];

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

/**
 * Website map: the Action Tokens pin map, set up here and pasted onto your own site
 * with one snippet. The map is served by the AR app; changes saved here go live
 * without touching the website.
 */
export function EmbedsView() {
  const router = useRouter();
  const utils = api.useUtils();
  const embeds = api.embeds.embeds.useQuery();
  const [deleting, setDeleting] = useState<Embed | null>(null);

  const refresh = () => void utils.embeds.embeds.invalidate();
  const duplicate = api.embeds.duplicateEmbed.useMutation({
    onSuccess: () => {
      toast.success("Duplicated");
      refresh();
    },
    onError: (error) => toast.error(messageOf(error)),
  });
  const setEnabled = api.embeds.setEmbedEnabled.useMutation({
    onSuccess: (result) => {
      toast.success(
        result.isEnabled ? "Map turned on" : "Map turned off. Websites show 'Map unavailable'.",
      );
      refresh();
    },
    onError: (error) => toast.error(messageOf(error)),
  });
  const remove = api.embeds.removeEmbed.useMutation({
    onSuccess: () => {
      toast.success("Deleted");
      setDeleting(null);
      refresh();
    },
    onError: (error) => toast.error(messageOf(error)),
  });

  const copy = (id: string) =>
    void navigator.clipboard
      .writeText(scriptSnippet(id))
      .then(() => toast.success("Snippet copied"));
  const add = (
    <Button asChild>
      <Link href="/embeds/new">
        <Plus /> New map
      </Link>
    </Button>
  );

  return (
    <PageBody className="grid gap-6">
      <PageHeader
        eyebrow="Fans"
        title="Website map"
        description="Put your pins on your own website: a homepage hero, a tour page, anywhere. Paste one snippet; settings you change here update the live map."
        actions={embeds.data && embeds.data.length > 0 ? add : undefined}
      />
      {embeds.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : embeds.isError ? (
        <ErrorState message="Couldn't load your maps." onRetry={() => void embeds.refetch()} />
      ) : embeds.data.length === 0 ? (
        <EmptyState
          icon={Code2}
          title="No website maps yet"
          description="Create one, set where it opens and how it looks, then paste the snippet into your site. Visitors see your pins nearby and open them in Action Tokens."
          action={add}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {embeds.data.map((embed) => (
            <article
              key={embed.id}
              className={cn(
                "bg-surface flex flex-col rounded-[1.4rem] border-2 p-4",
                !embed.isEnabled && "opacity-75",
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className="mt-0.5 size-9 shrink-0 rounded-xl border"
                  style={{ background: embed.accentColor }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/embeds/${embed.id}`}
                    className="block truncate font-semibold hover:underline"
                  >
                    {embed.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {embed.isEnabled ? <Badge>Live</Badge> : <Badge variant="secondary">Off</Badge>}
                    <Badge variant="outline" className="gap-1">
                      <Globe className="size-3" />
                      {embed.allowedDomains.length
                        ? embed.allowedDomains.slice(0, 2).join(", ") +
                          (embed.allowedDomains.length > 2
                            ? ` +${embed.allowedDomains.length - 2}`
                            : "")
                        : "Any website"}
                    </Badge>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon-sm" variant="ghost" aria-label={`Actions for ${embed.name}`}>
                      <MoreVertical />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => router.push(`/embeds/${embed.id}`)}>
                      <Pencil /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => copy(embed.id)}>
                      <Copy /> Copy snippet
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => duplicate.mutate({ embedId: embed.id })}>
                      <CopyPlus /> Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        setEnabled.mutate({ embedId: embed.id, isEnabled: !embed.isEnabled })
                      }
                    >
                      <Power /> {embed.isEnabled ? "Turn off" : "Turn on"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => setDeleting(embed)}>
                      <Trash2 /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="bg-surface-2 mt-4 grid grid-cols-3 gap-2 rounded-xl p-3 text-center">
                <Stat
                  icon={Eye}
                  label="Views"
                  week={embed.last7.views}
                  month={embed.last30.views}
                />
                <Stat
                  icon={MousePointerClick}
                  label="Pin taps"
                  week={embed.last7.pinTaps}
                  month={embed.last30.pinTaps}
                />
                <Stat
                  icon={Globe}
                  label="Opened"
                  week={embed.last7.openClicks}
                  month={embed.last30.openClicks}
                />
              </div>
              <p className="text-fg-muted mt-1.5 text-center text-[11px]">
                last 7 days · 30 days in grey
              </p>

              <div className="mt-auto flex gap-2 pt-4">
                <Button variant="outline" className="flex-1" onClick={() => copy(embed.id)}>
                  <Copy /> Copy snippet
                </Button>
                <Button className="flex-1" asChild>
                  <Link href={`/embeds/${embed.id}`}>
                    <Pencil /> Edit
                  </Link>
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete “${deleting?.name ?? ""}”?`}
        description="Websites using this map will show “Map unavailable”, and its stats are removed. This can't be undone. To pause it instead, turn it off."
        busy={remove.isPending}
        onConfirm={() => deleting && remove.mutate({ embedId: deleting.id })}
      />
    </PageBody>
  );
}

function Stat({
  icon: Icon,
  label,
  week,
  month,
}: {
  icon: typeof Eye;
  label: string;
  week: number;
  month: number;
}) {
  return (
    <div>
      <p className="text-fg-muted flex items-center justify-center gap-1 text-[11px]">
        <Icon className="size-3" /> {label}
      </p>
      <p className="num text-lg font-semibold">{week.toLocaleString()}</p>
      <p className="text-fg-muted num text-[11px]">{month.toLocaleString()}</p>
    </div>
  );
}
