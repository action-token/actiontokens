"use client";

import { Button } from "@actiontokens/ui/components/button";
import { ToastViewport, TransactionToast } from "@actiontokens/ui/patterns/transaction-toast";

import type { useWalletPayment } from "./use-wallet-payment";

/** The one toast a money action moves through (countdown, confirm in wallet, sending, done or failed). */
export function PaymentToast({ flow }: { flow: ReturnType<typeof useWalletPayment> }) {
  if (!flow.step) return null;
  return (
    <ToastViewport>
      <TransactionToast
        key={flow.step.kind}
        step={flow.step}
        onSend={flow.send}
        onCancel={flow.stop}
        actions={
          <Button
            size="sm"
            variant="secondary"
            className="h-8 px-3 text-[13px]"
            onClick={flow.step.kind === "confirm" ? flow.stop : flow.close}
          >
            {flow.step.kind === "confirm" ? "Cancel" : "Close"}
          </Button>
        }
      />
    </ToastViewport>
  );
}
