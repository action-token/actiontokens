"use client";

import { Download, Loader2, QrCode } from "lucide-react";
import { useState } from "react";

import { Button } from "@bandcoin/ui/components/button";

import { QrDialog, type QrTarget } from "./qr-dialog";
import { usePinQrs, type QrPin } from "./use-pin-qrs";

/** Opens the preview, download and print dialog for one spot's code. */
export function QrButton({ target, className }: { target: QrTarget; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className={className}
        onClick={() => setOpen(true)}
        aria-label={`QR code for ${target.pin.title}`}
        title="QR code: preview, download, print"
      >
        <QrCode />
      </Button>
      <QrDialog open={open} onOpenChange={setOpen} target={target} />
    </>
  );
}

/** Every spot's code as one zip, from the pin's row. A pin has no single code to preview, so it skips the dialog. */
export function QrDownloadAllButton({
  pin,
  artistName,
  className,
}: {
  pin: QrPin;
  artistName: string;
  className?: string;
}) {
  const { downloadAll, isPending } = usePinQrs({ pin, artistName });
  const noun = pin.spots.length === 1 ? "code" : "codes";
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={className}
      disabled={isPending}
      onClick={() => void downloadAll()}
      aria-label={`Download all QR ${noun} for ${pin.title}`}
      title={`Download all QR ${noun} (zip)`}
    >
      {isPending ? <Loader2 className="animate-spin" /> : <Download />}
    </Button>
  );
}
