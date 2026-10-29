import { Check } from "lucide-react";

import type { OnboardingStep } from "@bandcoin/api";
import { cn } from "@bandcoin/ui/lib/cn";

const STEPS = ["Apply", "Open your account", "Review"];

/** Which of the three steps is current: 0 apply, 1 open account, 2 review, 3 all done. */
const CURRENT: Record<OnboardingStep | "NONE", number> = {
  NONE: 0,
  REJECTED: 0,
  OPEN_ISSUER: 1,
  WAITING_FOR_APPROVAL: 2,
  READY: 3,
  BANNED: 3,
};

/** The three steps to becoming an artist, with the current one marked. */
export function OnboardingProgress({ step }: { step: OnboardingStep | null }) {
  const current = CURRENT[step ?? "NONE"];
  return (
    <ol className="flex flex-wrap gap-2" aria-label="Progress">
      {STEPS.map((label, index) => {
        const done = index < current;
        return (
          <li
            key={label}
            aria-current={index === current ? "step" : undefined}
            className={cn(
              "flex h-8 items-center gap-2 rounded-full border px-3 text-[13px] font-medium",
              done && "text-fg-muted",
              index === current && "bg-primary text-primary-foreground border-fg font-semibold",
              index > current && "text-fg-faint",
            )}
          >
            <span className="grid size-4 place-items-center text-[11px]">
              {done ? <Check className="size-3.5" strokeWidth={3} /> : index + 1}
            </span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}
