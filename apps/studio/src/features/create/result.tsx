"use client";

import { Check, Coins, Copy, Download, RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "@bandcoin/ui/components/dialog";
import { Markdown } from "@bandcoin/ui/patterns/markdown";
import { cn } from "@bandcoin/ui/lib/cn";

import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

export type Run = RouterOutputs["generate"]["library"]["items"][number];
type Output = Run["outputs"][number];

const running = (run: Run) => run.status === "QUEUED" || run.status === "RUNNING";

/**
 * One exchange in a tool's thread: what you asked for (right), what came back
 * (left): images, a video, or text; while it runs, its progress; when it
 * failed, why (and that the coins came back). Under it: the model, the price,
 * and Download / Copy / Use again / Remove.
 */
export function Exchange({
  run,
  modelName,
  onReuse,
}: {
  run: Run;
  modelName: string;
  onReuse: (prompt: string) => void;
}) {
  const utils = api.useUtils();
  const remove = api.generate.remove.useMutation({
    onSuccess: () => utils.generate.library.invalidate(),
  });
  return (
    <li id={`run-${run.id}`} className="grid scroll-mt-24 gap-3">
      <p className="bg-surface-2 ml-auto max-w-[80%] rounded-[1.4rem] rounded-br-md px-4 py-2.5 text-[15px] whitespace-pre-wrap">
        {run.prompt}
      </p>
      <div className="grid max-w-full gap-2">
        {running(run) ? (
          <Working run={run} />
        ) : run.status === "FAILED" ? (
          <p className="bg-danger-soft text-danger flex items-start gap-2 rounded-2xl px-4 py-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              {run.error ?? "It didn't work."} Your {run.cost} coins came back.
            </span>
          </p>
        ) : (
          <Outputs run={run} />
        )}
        <div className="text-fg-faint flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="bg-surface-2 text-fg-muted rounded-full px-2 py-0.5 font-semibold">
            {modelName}
          </span>
          <span className="flex items-center gap-1 tabular-nums">
            <Coins className="size-3" /> {run.cost}
          </span>
          <span>{timeAgo(run.createdAt)}</span>
          <span className="flex-1" />
          <Action
            icon={RotateCcw}
            label="Use this prompt again"
            onClick={() => onReuse(run.prompt)}
          />
          {!running(run) && (
            <Action
              icon={Trash2}
              label="Remove"
              onClick={() => remove.mutate({ generationId: run.id })}
            />
          )}
        </div>
      </div>
    </li>
  );
}

function Action({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Copy;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="hover:text-fg hover:bg-surface-2 flex size-7 items-center justify-center rounded-full transition-colors"
    >
      <Icon className="size-3.5" />
    </button>
  );
}

function Working({ run }: { run: Run }) {
  return (
    <div className="bg-surface grid gap-3 rounded-2xl border-2 p-4">
      <div className="flex items-center gap-3">
        <span className="bg-primary relative flex size-9 items-center justify-center rounded-full">
          <span className="border-primary-foreground size-4 animate-spin rounded-full border-2 border-t-transparent" />
        </span>
        <span className="grid">
          <span className="text-sm font-semibold">
            {run.status === "QUEUED" ? "Queued" : "Making it…"}
          </span>
          <span className="text-fg-muted text-xs">
            {run.message ?? "This takes a few seconds."}
          </span>
        </span>
      </div>
      <div className="bg-surface-2 h-1.5 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-700"
          style={{ width: `${Math.max(8, run.progress ?? 8)}%` }}
        />
      </div>
    </div>
  );
}

function Outputs({ run }: { run: Run }) {
  const images = run.outputs.filter((output) => output.type === "image");
  const [open, setOpen] = useState<Output | null>(null);
  return (
    <>
      {images.length > 0 && (
        <div className={cn("grid gap-2", images.length > 1 ? "grid-cols-2" : "max-w-xl")}>
          {images.map((image, index) =>
            image.type === "image" ? (
              <button
                key={image.url}
                type="button"
                onClick={() => setOpen(image)}
                className="group bg-surface-2 relative overflow-hidden rounded-2xl"
                aria-label={`Open image ${index + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt={run.prompt}
                  className="w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                />
              </button>
            ) : null,
          )}
        </div>
      )}
      {run.outputs.map((output, index) =>
        output.type === "video" ? (
          <video
            key={output.url}
            src={output.url}
            controls
            playsInline
            className="bg-surface-2 w-full max-w-2xl rounded-2xl"
          />
        ) : output.type === "text" ? (
          <TextOutput key={index} text={output.text} social={run.type === "SOCIAL"} />
        ) : null,
      )}
      {images.length > 0 && (
        <div className="flex gap-1">
          {images.map((image, index) =>
            image.type === "image" ? (
              <a
                key={image.url}
                href={image.url}
                download
                target="_blank"
                rel="noreferrer"
                className="text-fg-muted hover:text-fg flex items-center gap-1 text-xs font-semibold"
              >
                <Download className="size-3.5" />{" "}
                {images.length > 1 ? `Image ${index + 1}` : "Download"}
              </a>
            ) : null,
          )}
        </div>
      )}
      {run.outputs.some((output) => output.type === "video") && (
        <a
          href={(run.outputs.find((output) => output.type === "video") as { url: string }).url}
          download
          target="_blank"
          rel="noreferrer"
          className="text-fg-muted hover:text-fg flex items-center gap-1 text-xs font-semibold"
        >
          <Download className="size-3.5" /> Download video
        </a>
      )}
      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <DialogContent className="max-w-5xl p-2">
          <DialogTitle className="sr-only">{run.prompt}</DialogTitle>
          {open?.type === "image" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={open.url}
              alt={run.prompt}
              className="max-h-[85dvh] w-full rounded-xl object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Written text with Copy; social posts split into one card per version. */
function TextOutput({ text, social }: { text: string; social: boolean }) {
  const parts = social
    ? text
        .split(/\n-{4,}\n?/)
        .map((part) => part.trim())
        .filter(Boolean)
    : [text];
  return (
    <div className={cn("grid gap-2", social && parts.length > 1 && "md:grid-cols-2")}>
      {parts.map((part, index) => (
        <div key={index} className="bg-surface relative grid gap-2 rounded-2xl border-2 p-4 pr-12">
          <Markdown content={part} compact={social} />
          <CopyButton text={part} />
        </div>
      ))}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
      aria-label={copied ? "Copied" : "Copy"}
      title={copied ? "Copied" : "Copy"}
      className="text-fg-muted hover:text-fg hover:bg-surface-2 absolute top-3 right-3 flex size-8 items-center justify-center rounded-full"
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
    </button>
  );
}
