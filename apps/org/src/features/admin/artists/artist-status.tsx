import { Ban, Clock, UserCheck, X } from "lucide-react";

import { StatusPill } from "@actiontokens/ui/patterns/status-pill";

type Status = "PENDING" | "APPROVED" | "REJECTED" | "BANNED";

/** An artist's review state; a waiting artist who hasn't paid says so. */
export function OrganizationStatus({ status, paid }: { status: Status; paid: boolean }) {
  if (status === "APPROVED")
    return (
      <StatusPill tone="success" icon={UserCheck}>
        Approved
      </StatusPill>
    );
  if (status === "BANNED")
    return (
      <StatusPill tone="danger" icon={Ban}>
        Banned
      </StatusPill>
    );
  if (status === "REJECTED")
    return (
      <StatusPill tone="neutral" icon={X}>
        Rejected
      </StatusPill>
    );
  return (
    <StatusPill tone="warning" icon={Clock}>
      {paid ? "Waiting for review" : "Hasn't paid yet"}
    </StatusPill>
  );
}
