"use client";

import { useEffect, useState } from "react";

import { ACTION_LOGO } from "../lib/action-logo";
import { cn } from "../lib/cn";

const SEEN_KEY = "bc-boot-seen";
const BOOT_MS = 600;

/**
 * The Action Tokens mark: the green pin with the A (the same logo as the AR app).
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src={ACTION_LOGO}
      alt=""
      aria-hidden
      className={cn("h-8 w-auto object-contain", className)}
    />
  );
}

/** Five bars that bounce like a level meter. */
export function Equalizer({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("flex h-11 items-end gap-[5px]", className)}>
      {[0, -200, -450, -650, -300].map((delay) => (
        <span
          key={delay}
          className="bg-primary animate-eq h-[30%] w-[7px] rounded-[3px]"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}

/**
 * Splash shown over the first visit only. The page renders underneath it and
 * nothing waits on it; it fades after BOOT_MS. Repeat visits never see it.
 * Pass `always` to show it on every mount (design preview).
 */
export function BootScreen({
  always = false,
  replayKey,
}: {
  always?: boolean;
  replayKey?: number;
}) {
  const [visible, setVisible] = useState(always);

  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // storage blocked: treat as a first visit
    }
    if (seen && !always) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), always ? 1400 : BOOT_MS);
    return () => clearTimeout(timer);
  }, [always, replayKey]);

  return (
    <div
      aria-hidden
      className={cn(
        "bg-bg absolute inset-0 z-50 grid place-items-center transition-[opacity,visibility] duration-400",
        visible ? "visible opacity-100" : "invisible opacity-0",
      )}
    >
      <div className="grid justify-items-center gap-4">
        <BrandMark className="h-14" />
        <Equalizer className="h-6 [&>span]:w-1" />
        <div
          key={replayKey}
          className="font-display animate-reveal text-[22px] leading-none font-extrabold tracking-tight [clip-path:inset(0_100%_0_0)]"
        >
          Action-Tokens
        </div>
      </div>
    </div>
  );
}
