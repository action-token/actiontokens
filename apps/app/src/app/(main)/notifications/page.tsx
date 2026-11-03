import type { Metadata } from "next";

import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";

import { NotificationsView } from "~/features/notifications/notifications-view";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <PageBody className="mx-auto grid w-full max-w-2xl gap-6">
      <PageHeader title="Notifications" />
      <NotificationsView />
    </PageBody>
  );
}
