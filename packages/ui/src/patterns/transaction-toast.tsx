"use client";

import { Check, PenLine, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "../lib/cn";

/**
 * The steps of one money action. A single toast moves through them; it is
 * never replaced by a stack of new toasts.
 *
 * countdown   custodial wallet: "Sending in 5 s" with Cancel (nothing is signed yet)
 * confirm     extension wallet: "Confirm in Freighter" (cancel happens in the wallet)
 * submitting  signed, waiting for Stellar
 * success     done
 * canceled    stopped before signing
 * failed      Stellar or the server refused; plain-words reason
 */
export type TransactionStep =
  | { kind: "countdown"; summary: string; seconds: number }
  | { kind: "confirm"; summary: string; walletName: string }
  | { kind: "submitting"; summary: string; title?: string }
  | { kind: "success"; title: string; body: string }
  | { kind: "canceled" }
  | { kind: "failed"; reason: string };

export const CUSTODIAL_COUNTDOWN_SECONDS = 5;

/**
 * Counts down from `seconds`, then calls `onElapsed` once. `cancel()` stops it
 * for good; `skip()` fires `onElapsed` right away.
 */
export function useCancelableCountdown(seconds: number, onElapsed: () => void) {
  const [left, setLeft] = useState(seconds);
  const done = useRef(false);
  const elapsed = useRef(onElapsed);
  elapsed.current = onElapsed;

  useEffect(() => {
    if (done.current) return;
    if (left <= 0) {
      done.current = true;
      elapsed.current();
      return;
    }
    const timer = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);

  return {
    secondsLeft: left,
    cancel: () => {
      done.current = true;
    },
    skip: () => {
      if (done.current) return;
      done.current = true;
      elapsed.current();
    },
  };
}

type Tone = "wait" | "ok" | "bad";

function ToastFrame({
  tone,
  icon,
  title,
  body,
  actions,
  progressMs,
}: {
  tone: Tone;
  icon: ReactNode;
  title: ReactNode;
  body: ReactNode;
  actions?: ReactNode;
  progressMs?: number;
}) {
  return (
    <div
      role="status"
      className="bg-surface border-border-strong shadow-raised animate-in fade-in slide-in-from-bottom-2 relative grid grid-cols-[28px_minmax(0,1fr)] gap-3 overflow-hidden rounded-md border p-4"
    >
      <div
        className={cn(
          "grid size-7 place-items-center rounded-full [&_svg]:size-[15px]",
          tone === "wait" && "bg-surface-3 text-primary-text",
          tone === "ok" && "bg-success/15 text-success",
          tone === "bad" && "bg-danger-soft text-danger",
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <b className="block text-sm">{title}</b>
        <p className="text-fg-muted text-[13px]">{body}</p>
        {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
      </div>
      {progressMs !== undefined && (
        <div
          className="bg-primary absolute bottom-0 left-0 h-[3px] w-full origin-left"
          style={{ animation: `bc-toast-drain ${progressMs}ms linear forwards` }}
        />
      )}
      <style>{"@keyframes bc-toast-drain{from{transform:scaleX(1)}to{transform:scaleX(0)}}"}</style>
    </div>
  );
}

const Spin = () => (
  <span className="block size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
);

const actionClass =
  "inline-flex h-8 items-center rounded-full px-3 text-[13px] font-semibold transition-colors";

/** Custodial countdown: sends when it reaches 0 unless Cancel is pressed. */
function CountdownToast({
  summary,
  seconds,
  onSend,
  onCancel,
}: {
  summary: string;
  seconds: number;
  onSend: () => void;
  onCancel: () => void;
}) {
  const { secondsLeft, cancel, skip } = useCancelableCountdown(seconds, onSend);
  // Focus Cancel so Esc/Enter users can stop it, without scrolling the page to the toast.
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => cancelRef.current?.focus({ preventScroll: true }), []);
  return (
    <ToastFrame
      tone="wait"
      icon={<PenLine />}
      title={
        <>
          Sending in <span className="num">{secondsLeft}</span> s
        </>
      }
      body={`${summary}. Changed your mind? Cancel now.`}
      progressMs={seconds * 1000}
      actions={
        <>
          <button
            ref={cancelRef}
            type="button"
            className={cn(actionClass, "bg-surface-3 hover:bg-border-strong")}
            onClick={() => {
              cancel();
              onCancel();
            }}
          >
            Cancel
          </button>
          <button type="button" className={cn(actionClass, "text-fg-muted hover:text-fg")} onClick={skip}>
            Send now
          </button>
        </>
      }
    />
  );
}

/** Renders the current step. The caller owns the step and moves it forward. */
export function TransactionToast({
  step,
  onSend,
  onCancel,
  actions,
}: {
  step: TransactionStep;
  /** Countdown finished or "Send now": sign and submit. */
  onSend?: () => void;
  /** Cancel pressed during the countdown. */
  onCancel?: () => void;
  /** Extra buttons for the final steps (View, Try again, Close). */
  actions?: ReactNode;
}) {
  switch (step.kind) {
    case "countdown":
      return (
        <CountdownToast
          summary={step.summary}
          seconds={step.seconds}
          onSend={() => onSend?.()}
          onCancel={() => onCancel?.()}
        />
      );
    case "confirm":
      return (
        <ToastFrame
          tone="wait"
          icon={<PenLine />}
          title={`Confirm in ${step.walletName}`}
          body={`${step.summary}. Check the amount in the ${step.walletName} window, then approve.`}
          actions={actions}
        />
      );
    case "submitting":
      return <ToastFrame tone="wait" icon={<Spin />} title={step.title ?? "Sending to Stellar…"} body={step.summary} />;
    case "success":
      return <ToastFrame tone="ok" icon={<Check />} title={step.title} body={step.body} actions={actions} />;
    case "canceled":
      return (
        <ToastFrame
          tone="bad"
          icon={<X />}
          title="Payment canceled"
          body="Nothing was signed or sent. Your balance is unchanged."
          actions={actions}
        />
      );
    case "failed":
      return <ToastFrame tone="bad" icon={<X />} title="Payment didn't go through" body={step.reason} actions={actions} />;
  }
}

/** Fixed corner where transaction toasts live (bottom-right, above the player on phones). */
export function ToastViewport({ children }: { children: ReactNode }) {
  return (
    <div
      aria-live="assertive"
      className="fixed right-[max(16px,env(safe-area-inset-right))] bottom-[calc(16px+env(safe-area-inset-bottom))] z-[60] grid w-[min(380px,calc(100vw-32px))] gap-2"
    >
      {children}
    </div>
  );
}
