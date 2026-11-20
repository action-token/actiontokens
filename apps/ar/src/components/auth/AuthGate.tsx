import { motion } from "framer-motion";
import { Wallet } from "lucide-react";

import { GATE_COPY, useAuth } from "~/lib/ar/store";
import { ArButton } from "~/components/ui/ArButton";
import { BottomSheet } from "~/components/ui/BottomSheet";

/**
 * ── AuthGate ───────────────────────────────────────────────────────────────
 *
 * The app's single read/write boundary. Everything is browsable signed out —
 * the map, every pin, every brand, every public collection. This sheet only
 * appears at the moment someone tries to *change* something: collect, follow,
 * redeem, edit.
 *
 * That ordering is deliberate. Somebody who just scanned a QR code on a table
 * tent has no idea what Bandcoin AR is yet; asking them to connect a wallet before
 * they've seen a single pin is how you lose them. They see the drop first,
 * decide they want it, and only then meet this.
 *
 * "Connect wallet" below opens the real chooser: `signIn()` (in
 * `lib/ar/store.ts`) just flips the wallet package's own
 * `useConnectWalletDialogStore` open, and `<ConnectDialog>` (mounted once in `_app.tsx`)
 * does the rest — Albedo, Freighter, xBull, Rabet, Hana, MetaMask, HOT
 * Wallet, Lobstr, Google, Apple, and email/password all in one dialog.
 * `<SessionSync>` then mirrors the resulting session back into `useAuth`,
 * which is the only thing this sheet — and every screen's `requireAuth()` —
 * actually reads.
 *
 * Known gap: that dialog isn't constrained to the phone frame yet, so it
 * currently opens as an ordinary centred desktop modal rather than something
 * shaped like the rest of this app. Its colours already match — its shadcn
 * primitives use the same CSS custom properties arcade.css repoints — only
 * the layout doesn't yet.
 */

const METHODS = [
  "Albedo",
  "Freighter",
  "xBull",
  "Rabet",
  "Hana",
  "MetaMask",
  "HOT Wallet",
  "Lobstr",
  "Google",
  "Apple",
  "Email",
] as const;

export function AuthGate() {
  const gate = useAuth((s) => s.gate);
  const closeGate = useAuth((s) => s.closeGate);
  const signIn = useAuth((s) => s.signIn);

  const copy = gate ? GATE_COPY[gate] : null;

  return (
    <BottomSheet open={Boolean(gate)} onClose={closeGate} labelledBy="auth-gate-title">
      {copy && (
        <div className="px-6 pt-4 pb-2">
          {/* Emblem */}
          <motion.div
            className="mx-auto mb-5 flex size-[66px] -rotate-6 items-center justify-center rounded-full border-[3px] border-[hsl(var(--st-ink))] bg-ar-accent shadow-[4px_4px_0_0_hsl(var(--st-paper))]"
            animate={{ y: [0, -3, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          >
            <Wallet size={28} strokeWidth={2.4} className="text-[hsl(var(--st-ink))]" />
          </motion.div>

          <h2
            id="auth-gate-title"
            className="font-display text-ar-text text-center text-[28px] leading-[0.95] uppercase"
          >
            {copy.title}
          </h2>
          <p className="text-ar-dim mx-auto mt-2 max-w-[19rem] text-center text-[13px] leading-relaxed">
            {copy.body}
          </p>

          <div className="mt-6 space-y-2.5">
            <ArButton variant="primary" size="lg" block icon={Wallet} onClick={signIn}>
              Connect wallet
            </ArButton>
            <ArButton variant="ghost" size="md" block onClick={closeGate}>
              Keep looking around
            </ArButton>
          </div>

          {/* What "connect" actually covers — a wallet-only prompt reads as
              crypto-gated to people who just want a free coffee. */}
          <div className="mt-5 border-t-2 border-dashed border-[hsl(var(--st-paper)/0.25)] pt-4">
            <p className="font-display text-ar-dim mb-2.5 text-center text-[12px] tracking-[0.1em] uppercase">
              Sign in with
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {METHODS.map((m, i) => (
                <span
                  key={m}
                  className={
                    "font-display bg-ar-surface-2 text-ar-text rounded-[4px] border-2 border-[hsl(var(--st-paper)/0.7)] px-2 py-0.5 text-[11px] tracking-[0.06em] uppercase " +
                    (i % 2 ? "rotate-2" : "-rotate-2")
                  }
                >
                  {m}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
