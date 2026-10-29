import type { ReactNode } from "react";

import { PortalShell } from "~/features/shell/portal-shell";
import { serverApi } from "~/server/api";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  // Worked out on the server so the sidebar arrives with the page instead of after
  // two client round trips (session, then status). A failure just falls back to the client.
  const status = await (await serverApi()).portal.status().catch(() => undefined);
  return <PortalShell initialStatus={status}>{children}</PortalShell>;
}
