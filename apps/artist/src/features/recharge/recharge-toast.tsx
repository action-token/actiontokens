"use client";

import Link from "next/link";

import { Button } from "@actiontokens/ui/components/button";
import {
  ToastViewport,
  TransactionToast,
  type TransactionStep,
} from "@actiontokens/ui/patterns/transaction-toast";

/** What drives the toast: Recharge, Send and Swap all have it. */
type Flow = {
  step: TransactionStep | null;
  send: () => void;
  stop: () => void;
  close: () => void;
};

/** The one toast a recharge-style order moves through: countdown or wallet prompt, sending, done. */
export function RechargeToast({ flow }: { flow: Flow }) {
  if (!flow.step) return null;
  return (
    <ToastViewport>
      <TransactionToast
        key={flow.step.kind}
        step={flow.step}
        onSend={flow.send}
        onCancel={flow.stop}
        actions={
          flow.step.kind === "success" ? (
            <>
              <Button asChild size="sm" variant="secondary" className="h-8 px-3 text-[13px]">
                <Link href="/wallet">View wallet</Link>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-3 text-[13px]"
                onClick={flow.close}
              >
                Close
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              className="h-8 px-3 text-[13px]"
              onClick={flow.step.kind === "confirm" ? flow.stop : flow.close}
            >
              {flow.step.kind === "confirm" ? "Cancel" : "Close"}
            </Button>
          )
        }
      />
    </ToastViewport>
  );
}
