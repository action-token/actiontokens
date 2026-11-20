"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@actiontokens/ui/components/button";
import { ConfirmDialog } from "@actiontokens/ui/patterns/confirm-dialog";

/** The "delete this" block at the foot of an edit page, with its confirmation. */
export function DeleteCard({
  title,
  confirmTitle,
  description,
  busy,
  onDelete,
}: {
  title: string;
  confirmTitle: string;
  description: string;
  busy: boolean;
  onDelete: () => void;
}) {
  const [asking, setAsking] = useState(false);
  return (
    <section className="bg-surface border-danger/30 grid gap-3 rounded-[1.4rem] border-2 p-5">
      <h2 className="display text-2xl">{title}</h2>
      <p className="text-fg-muted text-sm">{description}</p>
      <Button
        type="button"
        variant="outline"
        className="text-danger justify-self-start"
        onClick={() => setAsking(true)}
      >
        <Trash2 /> Delete
      </Button>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={confirmTitle}
        description={description}
        confirmLabel={busy ? "Deleting…" : "Delete"}
        busy={busy}
        onConfirm={onDelete}
      />
    </section>
  );
}
