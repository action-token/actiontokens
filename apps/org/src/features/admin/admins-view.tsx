"use client";

import { Copy, Loader2, Shield, ShieldCheck, ShieldOff, UserPlus } from "lucide-react";
import { useSession } from "next-auth/react";
import { useState } from "react";
import toast from "react-hot-toast";

import { abbreviateAddress } from "@actiontokens/utils/address";
import { Button } from "@actiontokens/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@actiontokens/ui/components/dialog";
import { Input } from "@actiontokens/ui/components/input";
import { ConfirmDialog } from "@actiontokens/ui/patterns/confirm-dialog";
import { DataTable, type Column } from "@actiontokens/ui/patterns/data-table";
import { PageBody, PageHeader } from "@actiontokens/ui/patterns/page-header";
import { Person } from "@actiontokens/ui/patterns/person";
import { StatusPill } from "@actiontokens/ui/patterns/status-pill";

import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

import { messageOf } from "./murals/model";

type Admin = RouterOutputs["admin"]["users"]["list"]["users"][number];

/** Admin › Admins, following Wadzzo's: who can run Bandcoin. Any admin adds or removes others, never themselves. */
export function AdminsView() {
  const me = useSession().data?.user.id;
  const utils = api.useUtils();
  const admins = api.admin.users.list.useQuery({ role: "ADMIN" });
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Admin | null>(null);
  const refresh = () => {
    void utils.admin.users.list.invalidate();
    void utils.admin.users.counts.invalidate();
  };
  const remove = api.admin.users.setAdmin.useMutation({
    onSuccess: () => {
      toast.success("Admin access removed");
      setRemoving(null);
      refresh();
    },
    onError: (error) => toast.error(messageOf(error)),
  });

  const columns: Column<Admin>[] = [
    {
      id: "admin",
      header: "Admin",
      skeleton: "person",
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Person
            name={row.name}
            image={row.avatarUrl}
            id={row.walletAddress ?? row.id}
            sub={row.email ?? (row.username ? `@${row.username}` : undefined)}
          />
          {row.id === me && <StatusPill tone="info">You</StatusPill>}
        </div>
      ),
    },
    {
      id: "key",
      header: "Wallet",
      skeleton: "mono",
      cell: (row) =>
        row.walletAddress ? (
          <span className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
            <span className="text-fg-muted font-mono text-xs">
              {abbreviateAddress(row.walletAddress, 8)}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Copy wallet"
              onClick={() =>
                void navigator.clipboard
                  .writeText(row.walletAddress!)
                  .then(() => toast.success("Wallet copied"))
              }
            >
              <Copy />
            </Button>
          </span>
        ) : (
          <span className="text-fg-faint">—</span>
        ),
    },
    {
      id: "joined",
      header: "Joined",
      skeleton: "short",
      cell: (row) => (
        <span className="text-fg-muted whitespace-nowrap">{timeAgo(row.createdAt)}</span>
      ),
    },
  ];

  return (
    <PageBody wide>
      <PageHeader
        eyebrow="Admin"
        title="Admins"
        description="Admins approve organizations and pins, manage users and see everything. Keep this list short."
        actions={
          <Button onClick={() => setAdding(true)}>
            <UserPlus /> Add admin
          </Button>
        }
      />

      <DataTable
        className="mt-6"
        label="Admins"
        columns={columns}
        rows={admins.data?.users}
        rowKey={(row) => row.id}
        loading={admins.isPending}
        skeletonRows={4}
        error={admins.isError ? "Couldn't load admins." : null}
        onRetry={() => void admins.refetch()}
        rowHref={(row) => `/admin/users/${row.id}`}
        actions={(row) => [
          {
            label: row.id === me ? "You can't remove yourself" : "Remove admin access",
            icon: ShieldOff,
            destructive: true,
            disabled: row.id === me,
            onSelect: () => setRemoving(row),
          },
        ]}
        empty={{ icon: Shield, title: "No admins" }}
      />

      {adding && <AddAdminDialog onClose={() => setAdding(false)} onAdded={refresh} />}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && !remove.isPending && setRemoving(null)}
        title={`Remove ${removing?.name ?? "this person"} as admin?`}
        description="They keep their account but lose the Admin section right away."
        confirmLabel="Remove access"
        busy={remove.isPending}
        onConfirm={() => removing && remove.mutate({ userId: removing.id, admin: false })}
      />
    </PageBody>
  );
}

function AddAdminDialog({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [who, setWho] = useState("");
  const [error, setError] = useState<string>();
  const add = api.admin.users.addAdmin.useMutation({
    onSuccess: () => {
      toast.success("Admin added");
      onAdded();
      onClose();
    },
    onError: (failure) => setError(messageOf(failure)),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && !add.isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (who.trim().length < 3) return setError("Paste their wallet or email.");
            add.mutate({ who });
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="text-primary-text size-5" /> Add an admin
            </DialogTitle>
            <DialogDescription>
              They need an account already. Ask them to sign in once, then paste their Stellar
              wallet or email.
            </DialogDescription>
          </DialogHeader>
          <div className="my-5 grid gap-1.5">
            <Input
              aria-label="Wallet or email"
              value={who}
              autoFocus
              spellCheck={false}
              onChange={(event) => {
                setWho(event.target.value);
                setError(undefined);
              }}
              placeholder="GABC… or name@example.com"
              className="font-mono text-xs"
            />
            {error && <p className="text-danger text-xs">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={add.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={add.isPending}>
              {add.isPending && <Loader2 className="animate-spin" />}
              Add admin
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
