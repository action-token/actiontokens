import { Coins, User } from "lucide-react";
import Link from "next/link";

import { cn } from "@actiontokens/ui/lib/cn";

import { formatCapsuleBalance } from "~/lib/ar/balance";
import { TOKEN_CODE } from "~/lib/market";
import { useAuth } from "~/lib/ar/store";
import { api } from "~/trpc/react";

/**
 * ── ProfileButton ──────────────────────────────────────────────────────────
 *
 * The way to your profile now that it's no longer a tab — the tab slot went
 * to Bounty. Top-right on every root screen, where apps conventionally keep
 * "you", so it's found without being taught.
 *
 * Signed in it's your avatar; signed out it's a plain person glyph, and
 * /profile itself carries the sign-in pitch.
 *
 * `balance` (the map) widens it into one capsule: your BANDCOIN balance, then
 * the avatar, all of it opening the profile.
 */
export function ProfileButton({
  className,
  balance = false,
}: {
  className?: string;
  balance?: boolean;
}) {
  const user = useAuth((s) => s.user);
  const withBalance = balance && Boolean(user);
  // The same query as the Profile page, so the number is the same one.
  const me = api.account.me.useQuery(undefined, { enabled: withBalance, staleTime: 30_000 });
  const shown = withBalance ? formatCapsuleBalance(me.data?.balances.BANDCOIN) : null;

  return (
    <Link
      href="/profile"
      aria-label={shown ? `Profile, ${shown} ${TOKEN_CODE}` : "Profile"}
      className={cn(
        "ar-glass text-ar-dim relative flex h-9 shrink-0 items-center justify-center rounded-full",
        withBalance ? "gap-1.5 pr-[3px] pl-2.5" : "w-9",
        "focus-visible:ring-ar-accent focus-visible:ring-2 focus-visible:outline-hidden",
        className,
      )}
    >
      {withBalance && (
        <span className="flex items-center gap-1">
          <Coins size={13} strokeWidth={2.4} className="text-ar-accent-hot shrink-0" />
          {me.isPending ? (
            <span className="bg-ar-line h-3 w-9 animate-pulse rounded-full" />
          ) : shown === null ? (
            <span className="font-hud text-ar-faint text-[11px] font-bold">—</span>
          ) : (
            <>
              <span className="font-hud text-ar-text text-[13px] leading-none font-bold tabular-nums">
                {shown}
              </span>
              <span className="font-hud text-ar-dim text-[8.5px] font-semibold tracking-[0.12em] uppercase">
                {TOKEN_CODE}
              </span>
            </>
          )}
        </span>
      )}
      {user ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.avatarUrl}
          alt=""
          className="ring-ar-accent/50 h-[30px] w-[30px] rounded-full object-cover ring-1"
        />
      ) : (
        <User size={17} strokeWidth={2.2} />
      )}
    </Link>
  );
}
