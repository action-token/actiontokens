"use client";

import { Ban, Loader2, ShieldCheck, ShieldOff, Undo2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@actiontokens/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@actiontokens/ui/components/dialog";
import { Textarea } from "@actiontokens/ui/components/textarea";
import { ConfirmDialog } from "@actiontokens/ui/patterns/confirm-dialog";
import type { RowAction } from "@actiontokens/ui/patterns/data-table";

import { api } from "~/trpc/react";

/** Who an action is about: enough to word the dialogs. */
export type Person = { id: string; name: string | null; role: string; suspended: boolean };

type Pending =
  | { kind: "suspend"; person: Person }
  | { kind: "unsuspend"; person: Person }
  | { kind: "admin"; person: Person; admin: boolean };

const nameOf = (person: Person) => person.name ?? "this person";

/**
 * Suspend, unsuspend, make or remove admin: the menu items for a person and
 * the dialogs that confirm them. Used by the users table and the person page.
 */
export function useUserActions(me: string | undefined) {
  const utils = api.useUtils();
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");
  const done = (message: string) => {
    toast.success(message);
    setPending(null);
    setReason("");
    void utils.admin.users.invalidate();
  };
  const failed = (error: { message: string }) => toast.error(error.message);
  const suspend = api.admin.users.suspend.useMutation({
    onSuccess: () => done("Account suspended"),
    onError: failed,
  });
  const unsuspend = api.admin.users.unsuspend.useMutation({
    onSuccess: () => done("Suspension lifted"),
    onError: failed,
  });
  const setAdmin = api.admin.users.setAdmin.useMutation({
    onSuccess: (result) => done(result.role === "ADMIN" ? "Now an admin" : "Admin removed"),
    onError: failed,
  });

  const actionsFor = (person: Person): RowAction[] => {
    const self = person.id === me;
    return [
      person.role === "ADMIN"
        ? {
            label: "Remove admin",
            icon: ShieldOff,
            disabled: self,
            onSelect: () => setPending({ kind: "admin", person, admin: false }),
          }
        : {
            label: "Make admin",
            icon: ShieldCheck,
            disabled: person.suspended,
            onSelect: () => setPending({ kind: "admin", person, admin: true }),
          },
      person.suspended
        ? {
            label: "Lift suspension",
            icon: Undo2,
            separator: true,
            onSelect: () => setPending({ kind: "unsuspend", person }),
          }
        : {
            label: "Suspend",
            icon: Ban,
            destructive: true,
            separator: true,
            disabled: self,
            onSelect: () => setPending({ kind: "suspend", person }),
          },
    ];
  };

  const close = (open: boolean) => {
    if (!open) {
      setPending(null);
      setReason("");
    }
  };

  const dialogs = (
    <>
      <Dialog
        open={pending?.kind === "suspend"}
        onOpenChange={(open) => !suspend.isPending && close(open)}
      >
        <DialogContent className="sm:max-w-md">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (pending?.kind === "suspend")
                suspend.mutate({ userId: pending.person.id, reason });
            }}
          >
            <DialogHeader>
              <DialogTitle>Suspend {pending ? nameOf(pending.person) : ""}?</DialogTitle>
              <DialogDescription>
                They are signed out and can&apos;t sign in or do anything until you lift it. Nothing
                they own or made is deleted.
              </DialogDescription>
            </DialogHeader>
            <label className="my-4 grid gap-1.5 text-sm font-medium">
              Reason (kept in the activity log)
              <Textarea
                value={reason}
                rows={3}
                maxLength={300}
                placeholder="e.g. Claiming pins from a fake location"
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={reason.trim().length < 3 || suspend.isPending}
              >
                {suspend.isPending && <Loader2 className="animate-spin" />} Suspend
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pending?.kind === "unsuspend"}
        onOpenChange={close}
        title={`Lift the suspension on ${pending ? nameOf(pending.person) : ""}?`}
        description="They can sign in and use Bandcoin again straight away."
        confirmLabel="Lift suspension"
        destructive={false}
        busy={unsuspend.isPending}
        onConfirm={() => pending && unsuspend.mutate({ userId: pending.person.id })}
      />

      <ConfirmDialog
        open={pending?.kind === "admin"}
        onOpenChange={close}
        title={
          pending?.kind === "admin" && pending.admin
            ? `Make ${nameOf(pending.person)} an admin?`
            : `Remove admin from ${pending ? nameOf(pending.person) : ""}?`
        }
        description={
          pending?.kind === "admin" && pending.admin
            ? "Admins can approve artists, suspend people, change fees and make other admins."
            : "They lose the admin pages. An approved artist keeps their artist tools."
        }
        confirmLabel={pending?.kind === "admin" && pending.admin ? "Make admin" : "Remove admin"}
        destructive={!(pending?.kind === "admin" && pending.admin)}
        busy={setAdmin.isPending}
        onConfirm={() =>
          pending?.kind === "admin" &&
          setAdmin.mutate({ userId: pending.person.id, admin: pending.admin })
        }
      />
    </>
  );

  return { actionsFor, dialogs };
}
