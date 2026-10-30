"use client";

import { Coins, Copy, ExternalLink, Link2, UserRound, Wallet } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@bandcoin/ui/components/tabs";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody } from "@bandcoin/ui/patterns/page-header";

import { api, type RouterOutputs } from "~/trpc/react";

import { ShortLinkPanel } from "../domain/short-link-panel";
import { VANITY_HOST } from "../domain/host";
import { FAN_APP_URL } from "../shell/links";

import { AccountsTab, FanTokenTab } from "./account-tabs";
import { ProfileForm } from "./profile-form";
import { ProfileHeader } from "./profile-header";

const TABS = [
  { id: "profile", label: "Profile & links", icon: UserRound },
  { id: "fan-token", label: "Fan token", icon: Coins },
  { id: "short-link", label: "Short link", icon: Link2 },
  { id: "accounts", label: "Accounts", icon: Wallet },
] as const;
type Tab = (typeof TABS)[number]["id"];

/**
 * Settings, as the artist's own profile (like Wadzzo's brand settings): the
 * header with cover and picture, then one tab per setting. The tab is in the
 * address (?tab=short-link) so other pages can link straight to it.
 */
export function SettingsView() {
  const profile = api.profile.overview.useQuery();

  if (profile.isPending) return <SettingsSkeleton />;
  if (profile.isError)
    return (
      <PageBody>
        <ErrorState message="Couldn't load your profile." onRetry={() => void profile.refetch()} />
      </PageBody>
    );
  return <Settings profile={profile.data} />;
}

function Settings({ profile }: { profile: RouterOutputs["profile"]["overview"] }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const param = search.get("tab");
  const tab: Tab = TABS.some((entry) => entry.id === param) ? (param as Tab) : "profile";
  const setTab = (next: string) =>
    router.replace(next === "profile" ? pathname : `${pathname}?tab=${next}`, { scroll: false });

  return (
    <PageBody className="grid max-w-none gap-6">
      <ProfileHeader
        profile={profile}
        onEdit={() => {
          setTab("profile");
          document.getElementById("profile-name")?.focus();
        }}
      />

      <div className="grid gap-2 md:grid-cols-3">
        <PageLinkCard slug={profile.slug} />
        <InfoCard
          icon={Coins}
          label="Fan token"
          value={profile.fanToken ? profile.fanToken.code : "Not set up yet"}
          onOpen={() => setTab("fan-token")}
        />
        <InfoCard
          icon={Wallet}
          label="Accounts"
          value={
            !profile.issuerAccount
              ? "Issuer needed"
              : profile.storageAccount
                ? "All open"
                : "Issuer open"
          }
          onOpen={() => setTab("accounts")}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line" className="w-full justify-start overflow-x-auto">
          {TABS.map((entry) => (
            <TabsTrigger key={entry.id} value={entry.id} className="flex-none">
              <entry.icon /> {entry.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="profile" className="mt-5">
          <ProfileForm profile={profile} />
        </TabsContent>
        <TabsContent value="fan-token" className="mt-5">
          <FanTokenTab profile={profile} onAccounts={() => setTab("accounts")} />
        </TabsContent>
        <TabsContent value="short-link" className="mt-5">
          <ShortLinkPanel />
        </TabsContent>
        <TabsContent value="accounts" className="mt-5">
          <AccountsTab profile={profile} />
        </TabsContent>
      </Tabs>
    </PageBody>
  );
}

/** The address fans use: the short link while it works, else the standard page. */
function PageLinkCard({ slug }: { slug: string }) {
  const vanity = api.vanity.overview.useQuery();
  const link = vanity.data?.link;
  const url = link?.works ? `https://${VANITY_HOST}/${link.name}` : `${FAN_APP_URL}/artist/${slug}`;

  return (
    <div className="bg-surface flex items-center gap-3 rounded-[1.2rem] border-2 p-3">
      <span className="bg-primary-soft text-primary-text flex size-10 shrink-0 items-center justify-center rounded-lg">
        <Link2 className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-fg-muted text-[11px] font-semibold tracking-wider uppercase">
          Your page
        </p>
        <p className="truncate text-sm">{url.replace(/^https?:\/\//, "")}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Copy link"
        onClick={() => void navigator.clipboard.writeText(url)}
      >
        <Copy />
      </Button>
      <Button variant="ghost" size="icon" asChild>
        <a href={url} target="_blank" rel="noreferrer" aria-label="Open your page">
          <ExternalLink />
        </a>
      </Button>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  label,
  value,
  onOpen,
}: {
  icon: typeof Coins;
  label: string;
  value: string;
  onOpen: () => void;
}) {
  return (
    <div className="bg-surface flex items-center gap-3 rounded-[1.2rem] border-2 p-3">
      <span className="bg-primary-soft text-primary-text flex size-10 shrink-0 items-center justify-center rounded-lg">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-fg-muted text-[11px] font-semibold tracking-wider uppercase">{label}</p>
        <p className="truncate font-mono text-sm">{value}</p>
      </div>
      <Button variant="ghost" size="sm" onClick={onOpen}>
        Open
      </Button>
    </div>
  );
}

/** The page's shape while it loads: full-width hero, picture and name, three cards, tabs, form. */
function SettingsSkeleton() {
  return (
    <PageBody className="grid max-w-none gap-6" aria-busy>
      <div>
        <Skeleton className="-mx-4 -mt-5 h-44 rounded-none sm:-mx-6 sm:h-56 lg:mx-[calc(var(--page-pad-x-lg,1.5rem)*-1)] lg:-mt-8 lg:h-64" />
        <div className="flex items-end gap-4 px-2 sm:px-5">
          <Skeleton className="border-bg -mt-14 size-24 shrink-0 rounded-full border-4 sm:size-28" />
          <div className="grid flex-1 gap-2 pb-1">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="hidden h-9 w-32 rounded-full sm:block" />
        </div>
        <div className="mt-3 grid gap-2 px-2 sm:px-5">
          <Skeleton className="h-4 w-80 max-w-full" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className="h-16 rounded-[1.2rem]" />
        ))}
      </div>
      <Skeleton className="h-9 w-96 max-w-full" />
      <Skeleton className="h-72 w-full rounded-[1.4rem]" />
    </PageBody>
  );
}
