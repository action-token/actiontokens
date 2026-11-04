"use client";

import { Trash2 } from "lucide-react";
import { signOut } from "next-auth/react";
import { useState } from "react";

import { ArButton } from "~/components/ui/ArButton";
import { api } from "~/trpc/react";

/**
 * Delete your account, from the profile (the app stores require it). Tapping
 * once opens the confirm; typing DELETE is the second step. The server says in
 * plain words when it can't (artists, funds in a Bandcoin-held wallet,
 * a payment in flight).
 */
export function DeleteAccountPanel() {
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const remove = api.account.delete.useMutation({
    onSuccess: () => void signOut({ callbackUrl: "/" }),
  });

  if (!open)
    return (
      <ArButton variant="ghost" size="md" block icon={Trash2} onClick={() => setOpen(true)}>
        Delete my account
      </ArButton>
    );

  return (
    <div className="border-ar-line rounded-ar grid gap-3 border p-4">
      <p className="text-ar-text text-[13px] font-semibold">Delete your account?</p>
      <p className="text-ar-dim text-[12px]">
        This removes your profile, follows, collected posts and pins, and your sign-in. It
        can&apos;t be undone. Tokens you hold stay on the Stellar network.
      </p>
      <label className="text-ar-dim grid gap-1.5 text-[12px]">
        Type DELETE to confirm
        <input
          value={word}
          onChange={(event) => setWord(event.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          className="bg-white/[0.04] text-ar-text border-ar-line rounded-ar h-11 border px-3 text-[14px]"
        />
      </label>
      {remove.error && (
        <p role="alert" className="text-ar-text rounded-ar bg-white/[0.06] p-3 text-[12px]">
          {remove.error.message}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <ArButton
          variant="ghost"
          size="md"
          disabled={remove.isPending}
          onClick={() => {
            setOpen(false);
            setWord("");
            remove.reset();
          }}
        >
          Keep it
        </ArButton>
        <ArButton
          variant="danger"
          size="md"
          busy={remove.isPending}
          disabled={word !== "DELETE"}
          onClick={() => remove.mutate({ confirm: word })}
        >
          Delete for good
        </ArButton>
      </div>
    </div>
  );
}
