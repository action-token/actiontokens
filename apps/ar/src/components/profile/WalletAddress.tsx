"use client";

import { Check, Copy, Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@actiontokens/ui/lib/cn";

/** Writes to the clipboard, with a textarea fallback for browsers that block the async API. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      el.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * The account's wallet address as a sticker row: a wallet icon, the address shortened in the
 * middle, and a Copy button that copies the full address and confirms with a check.
 */
export function WalletAddress({ address, className }: { address: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const short = address.length > 16 ? `${address.slice(0, 6)}…${address.slice(-6)}` : address;

  const copy = async () => {
    const ok = await copyText(address);
    setState(ok ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1800);
  };

  return (
    <div
      className={cn("ar-bevel rounded-ar flex items-center gap-2.5 py-1.5 pr-1.5 pl-3", className)}
    >
      <Wallet size={15} strokeWidth={2.4} className="text-ar-dim shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-hud text-ar-faint text-[9.5px] leading-none font-semibold tracking-[0.18em] uppercase">
          Wallet address
        </p>
        <p
          title={address}
          className="text-ar-text mt-1 truncate font-mono text-[12.5px] leading-none tracking-wide"
        >
          {short}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={state === "copied" ? "Address copied" : "Copy wallet address"}
        className={cn(
          "font-hud flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] border-2 px-3 text-[11px] font-semibold tracking-[0.1em] uppercase transition-colors",
          state === "failed"
            ? "bg-ar-danger border-[hsl(var(--st-ink))] text-white"
            : "bg-ar-accent border-[hsl(var(--st-ink))] text-[hsl(var(--st-ink))] shadow-[2px_2px_0_0_hsl(var(--st-ink))] active:translate-x-px active:translate-y-px active:shadow-none",
        )}
      >
        {state === "copied" ? (
          <Check size={14} strokeWidth={3} />
        ) : (
          <Copy size={14} strokeWidth={2.6} />
        )}
        <span aria-live="polite">
          {state === "copied" ? "Copied" : state === "failed" ? "Failed" : "Copy"}
        </span>
      </button>
    </div>
  );
}
