"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@bandcoin/ui/components/dialog";
import { Textarea } from "@bandcoin/ui/components/textarea";

/** Asks why before an admin hides something from fans; the reason goes in the activity log. */
export function HideDialog({
  open,
  title,
  description,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const close = () => {
    setReason("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && close()}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onConfirm(reason);
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <label className="my-4 grid gap-1.5 text-sm font-medium">
            Reason
            <Textarea
              value={reason}
              rows={3}
              maxLength={300}
              placeholder="e.g. Uses someone else's artwork"
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={reason.trim().length < 3 || busy}>
              {busy && <Loader2 className="animate-spin" />} Hide
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
