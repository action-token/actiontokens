"use client";

import { CheckCircle2, Clock, Ticket, Users, type LucideIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@bandcoin/ui/components/tabs";
import { cn } from "@bandcoin/ui/lib/cn";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";

import { api } from "~/trpc/react";

import { CodeChecker } from "./code-checker";
import { HistoryTab, RewardsTab } from "./lists";

type Tab = "rewards" | "history";

/**
 * Redeem: a fan shows the 6-character code they got when collecting a pin;
 * you check it and hand over the reward. Below, each reward's progress and the
 * redemption history.
 */
export function RedeemView() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const tab: Tab = search.get("tab") === "history" ? "history" : "rewards";
  const setTab = (next: string) =>
    router.replace(next === "rewards" ? pathname : `${pathname}?tab=${next}`, { scroll: false });
  const summary = api.redeem.summary.useQuery();

  return (
    <PageBody className="grid gap-6">
      <PageHeader
        eyebrow="Insights"
        title="Redeem"
        description="Check a fan's code and redeem the reward they collected."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard icon={Ticket} label="Total rewards" value={summary.data?.rewards} />
        <SummaryCard icon={Users} label="Waiting to redeem" value={summary.data?.waiting} warn />
        <SummaryCard icon={CheckCircle2} label="Total redeemed" value={summary.data?.redeemed} />
      </div>
      <CodeChecker />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line">
          <TabsTrigger value="rewards">
            <Ticket /> Rewards
          </TabsTrigger>
          <TabsTrigger value="history">
            <Clock /> History
          </TabsTrigger>
        </TabsList>
        <TabsContent value="rewards" className="mt-5">
          <RewardsTab />
        </TabsContent>
        <TabsContent value="history" className="mt-5">
          <HistoryTab />
        </TabsContent>
      </Tabs>
    </PageBody>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  warn,
}: {
  icon: LucideIcon;
  label: string;
  value: number | undefined;
  warn?: boolean;
}) {
  return (
    <div className="bg-surface rounded-[1.4rem] border-2 p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg",
            warn ? "bg-warning/10" : "bg-primary/10",
          )}
        >
          <Icon className={cn("size-5", warn ? "text-warning" : "text-primary-text")} />
        </div>
        <div>
          <div className={cn("display num text-2xl", warn && "text-warning")}>
            {value === undefined ? <Skeleton className="h-7 w-10" /> : value.toLocaleString()}
          </div>
          <p className="text-fg-muted text-xs font-medium">{label}</p>
        </div>
      </div>
    </div>
  );
}
