import { motion } from "framer-motion";
import { Building2, LayoutGrid, Map as MapIcon, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "~/lib/navigation";
import { useState } from "react";

import { CameraLauncher } from "~/components/camera/CameraLauncher";
import { PackBar } from "~/components/murals/PackBar";

import { cn } from "@actiontokens/ui/lib/cn";

type Tab = {
  href: string;
  label: string;
  /** Shorter label for the dock, when the full one doesn't fit. */
  short?: string;
  icon: typeof MapIcon;
};

export const LEFT: Tab[] = [
  { href: "/map", label: "Map", icon: MapIcon },
  { href: "/collection", label: "Collection", short: "Stash", icon: LayoutGrid },
];

// Profile is not a tab — it's the avatar in each screen's header
// (`ProfileButton`), which freed this slot. Marketplace (plan 49) took Bounty's;
// Bounty is the map's pill.
export const RIGHT: Tab[] = [
  { href: "/marketplace", label: "Market", icon: ShoppingBag },
  { href: "/artists", label: "Organizations", short: "Orgs", icon: Building2 },
];

/**
 * ── BottomTabBar: the sticker dock ─────────────────────────────────────────
 *
 * ActionTokens' "Street Sticker" nav (docs/AR-STICKER-REDESIGN.md): a paper
 * pill floating above the bottom edge, black outline and a hard green shadow,
 * with a big tilted green AR sticker in the middle. Tabs are icons; the active
 * one is a black disc with a green icon. Labels stay as aria-labels/titles.
 *
 * Screen content runs under the dock (AppShell's `.ar-tabbed`), and each
 * scroll pane ends with a spacer `--ar-tabbar-space` tall (sticker.css).
 */
export function BottomTabBar() {
  const { pathname } = useRouter();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  // QR is a mode of the same camera screen, reached from the AR tab.
  const arActive = isActive("/ar") || isActive("/scan");
  // The AR button opens the camera launcher (AR · QR · Murals).
  const [launcherOpen, setLauncherOpen] = useState(false);

  return (
    <>
      <nav
        className="pointer-events-none absolute inset-x-3 z-40 flex flex-col items-center gap-[50px]"
        style={{ bottom: "max(12px, var(--ar-safe-bottom))" }}
      >
        {/* mural pack download progress, above the dock */}
        <PackBar />

        <div className="st-dock pointer-events-auto grid h-[62px] w-full max-w-[420px] grid-cols-5 items-center rounded-[22px] px-1.5">
          {LEFT.map((tab) => (
            <TabButton key={tab.href} tab={tab} active={isActive(tab.href)} />
          ))}

          {/* ── AR sticker: a tilted green squircle with camera corners and a
               scan line sweeping through it, bobbing gently ── */}
          <div className="relative flex justify-center">
            <button
              type="button"
              onClick={() => setLauncherOpen(true)}
              aria-label="Open camera"
              aria-haspopup="dialog"
              aria-current={arActive ? "page" : undefined}
              className="st-ar-bob relative -mt-8 size-[60px]"
            >
              <span className="st-ar-key absolute inset-0 flex -rotate-6 items-center justify-center overflow-hidden rounded-[18px]">
                <span aria-hidden className="st-ar-scan absolute inset-x-1.5 h-[2px] rounded-full" />
                <svg aria-hidden viewBox="0 0 40 40" fill="none" className="absolute inset-[9px]">
                  {[
                    "M2 11V5a3 3 0 0 1 3-3h6",
                    "M29 2h6a3 3 0 0 1 3 3v6",
                    "M38 29v6a3 3 0 0 1-3 3h-6",
                    "M11 38H5a3 3 0 0 1-3-3v-6",
                  ].map((d) => (
                    <path key={d} d={d} stroke="hsl(var(--st-ink))" strokeWidth="3.2" strokeLinecap="round" />
                  ))}
                </svg>
                <span className="font-display relative text-[17px] leading-none">AR</span>
              </span>
            </button>
          </div>

          {RIGHT.map((tab) => (
            <TabButton key={tab.href} tab={tab} active={isActive(tab.href)} />
          ))}
        </div>
      </nav>
      <CameraLauncher open={launcherOpen} onClose={() => setLauncherOpen(false)} />
    </>
  );
}

function TabButton({ tab, active }: { tab: Tab; active: boolean }) {
  const Icon = tab.icon;
  return (
    <Link
      href={tab.href}
      title={tab.label}
      aria-current={active ? "page" : undefined}
      className="relative mx-0.5 flex h-[50px] flex-col items-center justify-center gap-[3px] rounded-[14px] select-none"
    >
      {active && (
        <motion.span
          layoutId="dock-active"
          aria-hidden
          className="absolute inset-0 -rotate-2 rounded-[14px] bg-[hsl(var(--st-ink))]"
          transition={{ type: "spring", stiffness: 520, damping: 38, mass: 0.7 }}
        />
      )}
      <Icon
        strokeWidth={2.4}
        className={cn(
          "relative z-10 size-[19px] transition-colors duration-200",
          active ? "st-on-ink text-ar-accent" : "text-[hsl(var(--st-ink)/0.75)]",
        )}
      />
      <span
        className={cn(
          "font-display relative z-10 max-w-full truncate px-0.5 text-[8.5px] leading-none tracking-[0.02em] uppercase",
          active ? "st-on-ink text-ar-accent" : "text-[hsl(var(--st-ink)/0.75)]",
        )}
      >
        {tab.short ?? tab.label}
      </span>
    </Link>
  );
}
