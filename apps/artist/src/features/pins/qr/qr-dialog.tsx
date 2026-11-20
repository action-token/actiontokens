"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Printer,
  QrCode,
  ScanLine,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@actiontokens/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@actiontokens/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@actiontokens/ui/components/select";
import { Skeleton } from "@actiontokens/ui/components/skeleton";

import { buildSheetHtml, downloadBase64, printHtml, qrFilename } from "./print";
import { renderQr, type QrFormat } from "./qr-codes";
import { usePinQrs, type QrPin } from "./use-pin-qrs";

/**
 * The printed half of a pin. A fan scans the code with the camera already in
 * their pocket and collects it: no app, no account, no location permission,
 * which is the only path that works indoors or with no signal.
 *
 * One spot, one code; it holds `ar.bandcoin.io/scan?pin=<spotId>`. The only
 * choices are the two things a print run needs (file type and layout), and they
 * reset on close: the sticker is the artefact, this is a printing desk.
 */
export type QrTarget = {
  pin: QrPin;
  spotId: string;
  /** 1-based position among the pin's spots, null when it has just one. */
  spotNumber: number | null;
  artistName: string;
  /** Why a scan wouldn't work yet (scheduled, ended, hidden), or null. */
  notCollectable: string | null;
};

export function QrDialog({
  open,
  onOpenChange,
  target,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: QrTarget;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <Panel target={target} />}
    </Dialog>
  );
}

function Panel({ target }: { target: QrTarget }) {
  const { pin, spotId, spotNumber, artistName, notCollectable } = target;
  const [format, setFormat] = useState<QrFormat>("svg");
  const [copied, setCopied] = useState(false);
  const code = useQuery({
    queryKey: ["pin-qr", spotId, format],
    queryFn: () => renderQr(spotId, format),
    placeholderData: (previous) => previous,
    staleTime: Infinity,
  });
  const bulk = usePinQrs({ pin, artistName, format });

  const src = code.data ? `data:${code.data.contentType};base64,${code.data.base64}` : null;
  const caption = spotNumber
    ? `${pin.title} · Spot ${spotNumber} of ${pin.spots.length}`
    : pin.title;

  const download = () => {
    if (!code.data) return;
    downloadBase64(
      code.data.base64,
      qrFilename(pin, { spotId, pinNumber: spotNumber }, code.data.extension),
      code.data.contentType,
    );
    toast.success(`Downloaded ${code.data.extension.toUpperCase()}`);
  };
  const copyUrl = () => {
    if (!code.data) return;
    navigator.clipboard.writeText(code.data.scanUrl).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => toast.error("Couldn't reach the clipboard"),
    );
  };

  return (
    <DialogContent className="max-h-[92dvh] gap-0 overflow-hidden p-0 sm:max-w-lg">
      <DialogHeader className="gap-1 px-5 pt-5 pb-0">
        <DialogTitle className="display flex items-center gap-2">
          <QrCode className="text-primary-text size-4" />
          Print QR code
        </DialogTitle>
        <DialogDescription className="text-xs">
          Fans scan this with their phone camera and collect the pin. No app, no account, no
          location permission.
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-5">
        <div className="bg-surface-2 flex justify-center rounded-xl border p-5">
          {code.isError ? (
            <div className="flex size-[184px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 text-center">
              <QrCode className="text-fg-muted size-6" />
              <p className="text-fg-muted text-xs">Couldn&apos;t draw the code.</p>
            </div>
          ) : !src ? (
            <Skeleton className="size-[184px] rounded-lg" />
          ) : (
            // A white plate: the code is black on white and this dialog is not. Without it the quiet zone picks up the card colour.
            <div className="rounded-lg bg-white p-2.5 shadow-sm ring-1 ring-black/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`QR code that opens ${pin.title}`}
                width={184}
                height={184}
                className="size-[184px]"
              />
            </div>
          )}
        </div>

        {spotNumber && (
          <p className="text-fg-muted num mt-2.5 text-center text-xs">
            Spot {spotNumber} of {pin.spots.length} on this pin
          </p>
        )}

        {/* Above the actions: printing a run is the expensive mistake, so a code that wouldn't work yet should be read first. */}
        {notCollectable && (
          <p className="border-warning/40 bg-warning/10 text-warning mt-2.5 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs">
            <TriangleAlert className="mt-px size-4 shrink-0" />
            <span>
              {notCollectable} You can still print now: the code starts working the moment the pin
              goes live.
            </span>
          </p>
        )}

        {code.data && (
          <button
            type="button"
            onClick={copyUrl}
            className="bg-surface hover:bg-surface-2 mt-3 flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors"
          >
            <ScanLine className="text-fg-muted size-4 shrink-0" />
            <span className="text-fg-muted min-w-0 flex-1 truncate font-mono text-[11px]">
              {code.data.scanUrl}
            </span>
            {copied ? (
              <Check className="text-primary-text size-4 shrink-0" />
            ) : (
              <Copy className="text-fg-muted size-4 shrink-0" />
            )}
            <span className="sr-only">Copy link</span>
          </button>
        )}

        <div className="mt-4 grid gap-2">
          <label
            htmlFor="pin-qr-format"
            className="text-fg-muted block text-[11px] font-semibold tracking-wider uppercase"
          >
            File type
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Select value={format} onValueChange={(value) => setFormat(value as QrFormat)}>
              <SelectTrigger id="pin-qr-format" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="svg">SVG: any size</SelectItem>
                <SelectItem value="png">PNG: 512px</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" disabled={!code.data} onClick={download}>
              <Download /> Download
            </Button>
          </div>
          <Button
            disabled={!src}
            onClick={() =>
              src &&
              printHtml(
                buildSheetHtml([{ src, caption, artist: artistName }], {
                  title: pin.title,
                  columns: 1,
                }),
              )
            }
          >
            <Printer /> Print this code
          </Button>
        </div>

        {pin.spots.length > 1 && (
          <div className="mt-5 border-t pt-4">
            <p className="text-fg-muted text-xs">
              All {pin.spots.length} spots on this pin: {format === "svg" ? "vector" : "raster"}{" "}
              codes, three to a printed page.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                disabled={bulk.isPending}
                onClick={() => void bulk.downloadAll()}
              >
                {bulk.isPending ? <Loader2 className="animate-spin" /> : <Download />} All as zip
              </Button>
              <Button
                variant="outline"
                disabled={bulk.isPending}
                onClick={() => void bulk.printAll()}
              >
                {bulk.isPending ? <Loader2 className="animate-spin" /> : <Printer />} Print sheet
              </Button>
            </div>
          </div>
        )}

        {code.data && (
          <Button variant="ghost" size="sm" className="mt-2 w-full text-xs" asChild>
            <a href={code.data.scanUrl} target="_blank" rel="noreferrer">
              <ExternalLink /> Open it in a browser: check the link before you print 500
            </a>
          </Button>
        )}
      </div>
    </DialogContent>
  );
}
