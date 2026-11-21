"use client";

import { Loader2 } from "lucide-react";
import { signOut } from "next-auth/react";
import { useState } from "react";

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

import { api } from "~/trpc/react";

/**
 * Delete your account: types DELETE to confirm. The server says in plain words
 * when it can't (artists, funds still in an Action Tokens-held wallet, a payment in
 * flight), and nothing is removed until it says yes.
 */
export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const remove = api.account.delete.useMutation({
    onSuccess: () => void signOut({ callbackUrl: "/" }),
  });

  return (
    <>
      <Button variant="outline" className="text-destructive" onClick={() => setOpen(true)}>
        Delete my account
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (remove.isPending) return;
          setOpen(next);
          if (!next) {
            setWord("");
            remove.reset();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This removes your profile, follows, likes, comments and notifications, and your
              sign-in. It can&apos;t be undone. Tokens you hold stay on the Stellar network in your
              wallet.
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-1.5 text-sm">
            Type <span className="font-mono font-semibold">DELETE</span> to confirm
            <Input
              value={word}
              onChange={(event) => setWord(event.target.value)}
              autoComplete="off"
            />
          </label>
          {remove.error && (
            <p role="alert" className="bg-surface-2 rounded-xl p-3 text-sm">
              {remove.error.message}
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button variant="ghost" disabled={remove.isPending} onClick={() => setOpen(false)}>
              Keep my account
            </Button>
            <Button
              variant="destructive"
              disabled={word !== "DELETE" || remove.isPending}
              onClick={() => remove.mutate({ confirm: word })}
            >
              {remove.isPending && <Loader2 className="animate-spin" />} Delete for good
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
