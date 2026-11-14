import { Suspense } from "react";

import { DomainsAdminView } from "~/features/admin/domains-admin-view";

export const metadata = { title: "Domains" };

export default function AdminDomainsPage() {
  return (
    <Suspense>
      <DomainsAdminView />
    </Suspense>
  );
}
