"use client";

import { Coins, ShieldAlert, Trash2 } from "lucide-react";
import { useState } from "react";

import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@bandcoin/ui/components/alert-dialog";
import { Button } from "@bandcoin/ui/components/button";
import { cn } from "@bandcoin/ui/lib/cn";

import { api } from "~/trpc/react";

import { plural, type RejectReason } from "./model";

const OPTIONS: { value: RejectReason; title: string; body: string; icon: typeof Trash2 }[] = [
  { value: "NOT_A_MURAL", title: "Not a mural", body: "An honest mistake: a poster, a sign, a plain wall. People keep the coins they earned.", icon: Trash2 },
  { value: "FRAUD", title: "Fraud / spam", body: "Faked or farmed. Coins earned from it are taken back (never below 0).", icon: ShieldAlert },
];

/**
 * Rejecting always asks why, because the reason decides what happens to
 * people's coins. For fraud the dialog shows exactly how many will be taken
 * back before anything is confirmed.
 */
export function RejectDialog({ muralId, onOpenChange, busy, onConfirm }: { muralId: string | null; onOpenChange: (open: boolean) => void; busy: boolean; onConfirm: (reason: RejectReason) => void }) {
  // The parent keys this per mural, so each open starts on the safe reason.
  const [reason, setReason] = useState<RejectReason>("NOT_A_MURAL");
  const preview = api.admin.murals.revokePreview.useQuery({ muralId: muralId ?? "" }, { enabled: muralId !== null && reason === "FRAUD", refetchOnWindowFocus: false });

  return (
    <AlertDialog open={muralId !== null} onOpenChange={(open) => !busy && onOpenChange(open)}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Reject this mural?</AlertDialogTitle>
          <AlertDialogDescription>It stops being collectable and disappears from every map.</AlertDialogDescription>
        </AlertDialogHeader>

        <div role="radiogroup" aria-label="Reason" className="grid gap-2">
          {OPTIONS.map((option) => {
            const on = reason === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setReason(option.value)}
                className={cn("flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors", on ? "border-primary bg-primary/5 ring-primary/40 ring-1" : "hover:bg-surface-2")}
              >
                <option.icon className={cn("mt-0.5 size-4 shrink-0", option.value === "FRAUD" ? "text-danger" : "text-fg-muted")} />
                <span>
                  <span className="block text-sm font-semibold">{option.title}</span>
                  <span className="text-fg-muted mt-0.5 block text-xs">{option.body}</span>
                </span>
              </button>
            );
          })}
        </div>

        {reason === "FRAUD" && (
          <p className="tone-danger flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
            <Coins className="size-4 shrink-0" />
            {preview.isPending ? "Working out the coins…" : preview.data && preview.data.coins > 0 ? `Takes back up to ${preview.data.coins.toLocaleString()} coins from ${plural(preview.data.users, "person", "people")}.` : "Nobody has coins from it to take back."}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={busy} onClick={() => onConfirm(reason)}>
            {reason === "FRAUD" ? "Reject & take back coins" : "Reject"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
