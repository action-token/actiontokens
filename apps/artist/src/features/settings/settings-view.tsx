"use client";

import { Check, Coins, Copy, ExternalLink, Link2, UserRound, Wallet } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@bandcoin/ui/components/tabs";
import { cn } from "@bandcoin/ui/lib/cn";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody } from "@bandcoin/ui/patterns/page-header";

import { api, type RouterOutputs } from "~/trpc/react";

import { ShortLinkPanel } from "../domain/short-link-panel";
import { VANITY_HOST } from "../domain/host";
import { FAN_APP_URL } from "../shell/links";

import { AccountsTab, FanTokenTab } from "./account-tabs";
import { ProfileForm } from "./profile-form";
import { FULL_BLEED, ProfileHeader, SETTINGS_COLUMN } from "./profile-header";
import { SettingsSection } from "./settings-section";

type Profile = RouterOutputs["profile"]["overview"];

const TABS = [
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "fan-token", label: "Fan token", icon: Coins },
  { id: "short-link", label: "Short link", icon: Link2 },
  { id: "accounts", label: "Accounts", icon: Wallet },
] as const;
type Tab = (typeof TABS)[number]["id"];

/**
 * Settings, as the artist's own profile (like Wadzzo's brand settings): the
 * header with cover and picture, three status cards, then one tab per
 * setting. The tab is in the address (?tab=short-link) so other pages can
 * link straight to it.
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

function Settings({ profile }: { profile: Profile }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const param = search.get("tab");
  const tab: Tab = TABS.some((entry) => entry.id === param) ? (param as Tab) : "profile";
  const setTab = (next: string) =>
    router.replace(next === "profile" ? pathname : `${pathname}?tab=${next}`, { scroll: false });

  const accounts = !profile.issuerAccount
    ? { value: "Issuer not set up", ready: false, action: "Set up" }
    : profile.storageAccount
      ? { value: "Issuer and storage open", ready: true, action: "Manage" }
      : { value: "Issuer open", ready: true, action: "Manage" };

  return (
    <PageBody className="max-w-none pb-16">
      <ProfileHeader
        profile={profile}
        onEdit={() => {
          setTab("profile");
          requestAnimationFrame(() => document.getElementById("profile-name")?.focus());
        }}
      />

      <div className={cn(SETTINGS_COLUMN, "mt-6 grid grid-cols-1 gap-8")}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <PageLinkCard slug={profile.slug} />
          <StatusCard
            icon={Coins}
            label="Fan token"
            value={profile.fanToken ? profile.fanToken.code : "Not set up"}
            ready={Boolean(profile.fanToken)}
            action={profile.fanToken ? "Manage" : "Set up"}
            onOpen={() => setTab("fan-token")}
          />
          <StatusCard
            icon={Wallet}
            label="Accounts"
            {...accounts}
            onOpen={() => setTab("accounts")}
          />
        </div>

        <Tabs value={tab} onValueChange={setTab} className="gap-8">
          <TabsList variant="line" className="w-full justify-start overflow-x-auto border-b">
            {TABS.map((entry) => (
              <TabsTrigger key={entry.id} value={entry.id} className="flex-none">
                <entry.icon /> {entry.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="profile">
            <ProfileForm profile={profile} />
          </TabsContent>
          <TabsContent value="fan-token">
            <SettingsSection
              title="Fan token"
              description="Fans hold it to join your membership tiers. It's issued from your issuer account."
            >
              <FanTokenTab profile={profile} onAccounts={() => setTab("accounts")} />
            </SettingsSection>
          </TabsContent>
          <TabsContent value="short-link">
            <SettingsSection
              title="Short link"
              description={`A short address for your page, like ${VANITY_HOST}/yourname. Easy to say, print and share.`}
            >
              <ShortLinkPanel />
            </SettingsSection>
          </TabsContent>
          <TabsContent value="accounts">
            <SettingsSection
              title="Stellar accounts"
              description="The accounts behind your tokens. You pay to open them; Bandcoin keeps their keys safe, so you never need them."
            >
              <AccountsTab profile={profile} />
            </SettingsSection>
          </TabsContent>
        </Tabs>
      </div>
    </PageBody>
  );
}

const CARD = "bg-surface flex items-center gap-3 rounded-[1.2rem] border-2 p-3.5";

function CardIcon({ icon: Icon }: { icon: typeof Coins }) {
  return (
    <span className="bg-primary-soft text-primary-text flex size-10 shrink-0 items-center justify-center rounded-xl">
      <Icon className="size-5" />
    </span>
  );
}

function CardLabel({ children }: { children: string }) {
  return (
    <p className="text-fg-muted text-[11px] font-semibold tracking-wider uppercase">{children}</p>
  );
}

/** The address fans use: the short link while it works, else the standard page. */
function PageLinkCard({ slug }: { slug: string }) {
  const vanity = api.vanity.overview.useQuery();
  const [copied, setCopied] = useState(false);
  const link = vanity.data?.link;
  const url = link?.works ? `https://${VANITY_HOST}/${link.name}` : `${FAN_APP_URL}/artist/${slug}`;

  return (
    <div className={CARD}>
      <CardIcon icon={Link2} />
      <div className="min-w-0 flex-1">
        <CardLabel>Your page</CardLabel>
        <p className="truncate text-sm font-medium" title={url}>
          {url.replace(/^https?:\/\//, "")}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label={copied ? "Copied" : "Copy link"}
        onClick={() =>
          void navigator.clipboard.writeText(url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
      >
        {copied ? <Check /> : <Copy />}
      </Button>
      <Button variant="ghost" size="icon" asChild>
        <a href={url} target="_blank" rel="noreferrer" aria-label="Open your page">
          <ExternalLink />
        </a>
      </Button>
    </div>
  );
}

function StatusCard({
  icon,
  label,
  value,
  ready,
  action,
  onOpen,
}: {
  icon: typeof Coins;
  label: string;
  value: string;
  ready: boolean;
  action: string;
  onOpen: () => void;
}) {
  return (
    <div className={CARD}>
      <CardIcon icon={icon} />
      <div className="min-w-0 flex-1">
        <CardLabel>{label}</CardLabel>
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <span
            aria-hidden
            className={cn("size-2 shrink-0 rounded-full", ready ? "bg-success" : "bg-warning")}
          />
          <span className="truncate">{value}</span>
        </p>
      </div>
      <Button variant={ready ? "ghost" : "outline"} size="sm" onClick={onOpen}>
        {action}
      </Button>
    </div>
  );
}

/** The page's shape while it loads: full-width cover, picture and name, three cards, tabs, form. */
function SettingsSkeleton() {
  return (
    <PageBody className="max-w-none" aria-busy>
      <Skeleton className={cn(FULL_BLEED, "h-40 rounded-none sm:h-52 lg:h-60")} />
      <div className={cn(SETTINGS_COLUMN, "flex flex-col gap-4 sm:flex-row")}>
        <Skeleton className="border-bg -mt-12 size-24 shrink-0 rounded-full border-4 sm:-mt-16 sm:size-32" />
        <div className="grid flex-1 content-start gap-2 sm:pt-3">
          <div className="flex justify-between gap-3">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="hidden h-8 w-52 rounded-full sm:block" />
          </div>
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-80 max-w-full" />
          <div className="mt-1 flex gap-2">
            {[0, 1, 2, 3].map((key) => (
              <Skeleton key={key} className="h-7 w-20 rounded-full" />
            ))}
          </div>
        </div>
      </div>
      <div className={cn(SETTINGS_COLUMN, "mt-6 grid grid-cols-1 gap-8")}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-[4.5rem] rounded-[1.2rem]" />
          ))}
        </div>
        <Skeleton className="h-9 w-full" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
          <div className="grid content-start gap-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-full" />
          </div>
          <Skeleton className="h-72 rounded-[1.4rem]" />
        </div>
      </div>
    </PageBody>
  );
}
