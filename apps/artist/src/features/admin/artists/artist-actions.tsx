"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

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
import { ConfirmDialog } from "@bandcoin/ui/patterns/confirm-dialog";

import { api } from "~/trpc/react";

import { messageOf } from "../murals/model";

/** What the actions need to know about an artist (a list row or the detail page). */
export type ArtistRef = { id: string; name: string; paid: boolean };
type Pending = { artist: ArtistRef; action: "approve" | "ban" | "unban" | "reject" };

/**
 * Approve, reject, ban and unban for the Artists list and the artist page,
 * as Wadzzo's useCreatorActions. `dialogs` must be rendered once.
 */
export function useArtistActions() {
  const utils = api.useUtils();
  const [pending, setPending] = useState<Pending | null>(null);
  const done = (message: string) => {
    toast.success(message);
    setPending(null);
    void utils.admin.artists.list.invalidate();
    void utils.admin.artists.get.invalidate();
    void utils.admin.activity.list.invalidate();
  };
  const onError = (error: unknown) => toast.error(messageOf(error));
  const approve = api.admin.artists.approve.useMutation({
    onSuccess: (result) => {
      done(
        result.fanToken.status === "CREATED"
          ? `Approved, with their fan token ${result.fanToken.code}`
          : "Approved: their artist tools are open",
      );
      if (result.fanToken.status === "FAILED")
        toast.error(
          `Their fan token couldn't be made (${result.fanToken.message}). They can set it up in Memberships.`,
          { duration: 8000 },
        );
      if (result.storage.status === "FAILED")
        toast.error(
          `Their storage account couldn't be opened (${result.storage.message}). They can open it in Settings.`,
          { duration: 8000 },
        );
    },
    onError,
  });
  const ban = api.admin.artists.ban.useMutation({ onSuccess: () => done("Banned"), onError });
  const unban = api.admin.artists.unban.useMutation({
    onSuccess: (result) =>
      done(result.status === "APPROVED" ? "Unbanned: they're approved again" : "Unbanned"),
    onError,
  });
  const reject = api.admin.artists.reject.useMutation({
    onSuccess: () => done("Application rejected"),
    onError,
  });
  const busy = approve.isPending || ban.isPending || unban.isPending || reject.isPending;

  const name = pending?.artist.name ?? "";
  const settings = api.admin.settings.get.useQuery(undefined, {
    enabled: pending?.action === "approve",
  });
  const supply = Number(settings.data?.saved.fanTokenStartSupply ?? 0);
  const dialogs = (
    <>
      <ConfirmDialog
        open={pending?.action === "approve"}
        onOpenChange={(open) => !open && !busy && setPending(null)}
        title={`Approve ${name}?`}
        description={
          <>
            Their artist tools open and they appear on Bandcoin. Bandcoin also opens their storage
            account and pays for it: about 3 XLM from the platform account, which trusts BANDCOIN,
            USDC and their fan token
            {supply > 0
              ? `, and ${supply.toLocaleString("en-US")} of their fan token are issued into it.`
              : "."}
          </>
        }
        confirmLabel="Approve"
        busy={busy}
        onConfirm={() => pending && approve.mutate({ artistId: pending.artist.id })}
      />
      <ConfirmDialog
        open={pending?.action === "ban" || pending?.action === "unban"}
        onOpenChange={(open) => !open && !busy && setPending(null)}
        title={pending?.action === "unban" ? `Unban ${name}?` : `Ban ${name}?`}
        description={
          pending?.action === "unban"
            ? "They get their artist tools back."
            : "Their artist tools stop working and they won't be shown on Bandcoin. Nothing is refunded. You can unban them later."
        }
        confirmLabel={pending?.action === "unban" ? "Unban" : "Ban"}
        destructive={pending?.action !== "unban"}
        busy={busy}
        onConfirm={() => {
          if (!pending) return;
          const input = { artistId: pending.artist.id };
          if (pending.action === "unban") unban.mutate(input);
          else ban.mutate(input);
        }}
      />
      <RejectDialog
        key={pending?.action === "reject" ? pending.artist.id : "closed"}
        artist={pending?.action === "reject" ? pending.artist : null}
        busy={reject.isPending}
        onClose={() => setPending(null)}
        onReject={(artist, reason) => reject.mutate({ artistId: artist.id, reason })}
      />
    </>
  );

  return {
    busy,
    approve: (artist: ArtistRef) => setPending({ artist, action: "approve" }),
    askReject: (artist: ArtistRef) => setPending({ artist, action: "reject" }),
    askBan: (artist: ArtistRef) => setPending({ artist, action: "ban" }),
    askUnban: (artist: ArtistRef) => setPending({ artist, action: "unban" }),
    dialogs,
  };
}

function RejectDialog({
  artist,
  busy,
  onClose,
  onReject,
}: {
  artist: ArtistRef | null;
  busy: boolean;
  onClose: () => void;
  onReject: (artist: ArtistRef, reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={artist !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reject {artist?.name}?</DialogTitle>
          <DialogDescription>
            {artist?.paid
              ? "Their 1.5 XLM goes back to their wallet (less the network fee). "
              : "They hadn't paid, so nothing is sent. "}
            They see your reason and can apply again.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          maxLength={300}
          rows={3}
          placeholder="Why? For example: use your real artist name"
          onChange={(event) => setReason(event.target.value)}
        />
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={reason.trim().length < 3 || busy}
            onClick={() => artist && onReject(artist, reason)}
          >
            {busy && <Loader2 className="animate-spin" />}
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
