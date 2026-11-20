import { Send, X } from "lucide-react";
import { useState } from "react";

import { cn } from "@actiontokens/ui/lib/cn";

import { ArButton } from "~/components/ui/ArButton";
import { BottomSheet } from "~/components/ui/BottomSheet";
import { api } from "~/trpc/react";

import { Markdown } from "./Markdown";

/**
 * Write a report for a bounty you've joined. Reports are markdown, as on the
 * old Bandcoin, so the sheet can flip to a preview before sending.
 */
export function ReportSheet({
  bountyId,
  open,
  onClose,
}: {
  bountyId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(false);
  const utils = api.useUtils();
  const submit = api.bounty.submitReport.useMutation({
    onSuccess: async () => {
      setText("");
      setPreview(false);
      await utils.bounty.byId.invalidate({ bountyId });
      onClose();
    },
  });
  const busy = submit.isPending;

  return (
    <BottomSheet
      open={open}
      onClose={busy ? () => undefined : onClose}
      dismissible={!busy}
      labelledBy="report-sheet-title"
      className="flex max-h-[92%] flex-col"
    >
      <div className="flex items-center justify-between px-5 pt-2 pb-3">
        <h2 id="report-sheet-title" className="font-hud text-ar-text text-[17px] font-bold">
          Submit your report
        </h2>
        <button
          onClick={onClose}
          disabled={busy}
          aria-label="Close"
          className="text-ar-faint hover:text-ar-text disabled:opacity-40"
        >
          <X size={18} strokeWidth={2.4} />
        </button>
      </div>

      <div className="ar-scroll min-h-0 flex-1 px-5">
        <div
          role="tablist"
          aria-label="Report"
          className="ar-key mb-2 grid w-fit grid-cols-2 gap-1 rounded-[11px] p-1"
        >
          {(["Write", "Preview"] as const).map((label) => {
            const active = (label === "Preview") === preview;
            return (
              <button
                key={label}
                role="tab"
                aria-selected={active}
                onClick={() => setPreview(label === "Preview")}
                className={cn(
                  "font-hud rounded-[8px] px-3 py-1.5 text-[10px] font-bold tracking-[0.1em] uppercase",
                  active ? "bg-ar-accent/18 text-ar-accent-hot" : "text-ar-faint",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        {preview ? (
          <div className="ar-bevel rounded-ar min-h-[168px] p-3.5">
            {text.trim() ? (
              <Markdown content={text} />
            ) : (
              <p className="text-ar-faint text-[13px] italic">Nothing to preview yet.</p>
            )}
          </div>
        ) : (
          <>
            <label htmlFor="report-text" className="sr-only">
              Your report
            </label>
            <textarea
              id="report-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={busy}
              rows={7}
              maxLength={20_000}
              placeholder="Describe your submission. Markdown works: **bold**, lists, [links](https://…)."
              className="ar-bevel rounded-ar text-ar-text placeholder:text-ar-faint focus:border-ar-accent/50 w-full resize-none p-3.5 text-[14px] leading-relaxed outline-hidden"
            />
          </>
        )}

        {submit.error && (
          <p className="rounded-ar border-ar-danger/40 bg-ar-danger/10 text-ar-danger mt-3 border px-3.5 py-2.5 text-[12px] leading-relaxed">
            {submit.error.message}
          </p>
        )}
      </div>

      <div className="px-5 pt-3">
        <ArButton
          variant="primary"
          size="lg"
          block
          icon={Send}
          busy={busy}
          disabled={!text.trim()}
          onClick={() => submit.mutate({ bountyId, content: text })}
        >
          {busy ? "Sending…" : "Send report"}
        </ArButton>
      </div>
    </BottomSheet>
  );
}
