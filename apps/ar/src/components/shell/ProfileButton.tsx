import { User } from "lucide-react";
import Link from "next/link";

import { useAuth } from "~/lib/ar/store";
import { cn } from "@bandcoin/ui/lib/cn";

/**
 * ── ProfileButton ──────────────────────────────────────────────────────────
 *
 * The way to your profile now that it's no longer a tab — the tab slot went
 * to Bounty. Top-right on every root screen, where apps conventionally keep
 * "you", so it's found without being taught.
 *
 * Signed in it's your avatar; signed out it's a plain person glyph, and
 * /profile itself carries the sign-in pitch.
 */
export function ProfileButton({ className }: { className?: string }) {
  const user = useAuth((s) => s.user);

  return (
    <Link
      href="/profile"
      aria-label="Profile"
      className={cn(
        "ar-glass text-ar-dim relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
        "focus-visible:ring-ar-accent focus-visible:ring-2 focus-visible:outline-hidden",
        className,
      )}
    >
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
