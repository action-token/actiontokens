"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { DocumentDuplicateIcon, SignalSlashIcon } from "@heroicons/react/24/solid";
import {
  ArrowLeft,
  ArrowUpCircle,
  CheckCircle2,
  LogOut,
  Mail,
  QrCodeIcon,
  RefreshCcw,
  Wallet,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import clsx from "clsx";

import { appleProvider, googleProvider } from "../providers/custodial/social-sign-in";
import {
  configureWalletConnectClient,
  walletConnectProvider,
} from "../providers/extension/wallet-connect";
import { useConnectWalletDialogStore } from "../state/connect-dialog-store";
import { useWalletConnectModalStore } from "../state/wallet-connect-modal-store";
import { isStellarAccountActive } from "../stellar/horizon";
import { abbreviateAddress } from "@actiontokens/utils/address";
import { ForgotPasswordForm } from "./forgot-password-form";
import { EmailLoginForm } from "./email-login-form";
import { EmailSignUpForm } from "./email-sign-up-form";
import { AR_APP_FRAME_SELECTOR } from "./host-frame";
import { Button } from "@actiontokens/ui/components/button";
import { Dialog, DialogContent, DialogTitle } from "@actiontokens/ui/components/dialog";
import { useFacebookIosUserAgent } from "./use-facebook-ios-user-agent";
import { HanaIcon, MetaMaskIcon } from "./wallet-icons";
import { NON_CUSTODIAL_PROVIDERS } from "../providers/registry";
import { WalletType } from "../wallet-type";
import Image, { type StaticImageData } from "next/image";

import albedoLogo from "./assets/albedo.svg";
import freighterLogo from "./assets/freighter.png";
import rabetLogo from "./assets/rabet.png";
import xbullLogo from "./assets/xbull-dark.svg";
import lobstrLogo from "./assets/lobstr.png";
import brandMark from "./assets/actiontokens-mark.png";

type AuthView = "login" | "signup" | "forgot-password";
function getWalletLabel(walletType: WalletType): string {
  switch (walletType) {
    case WalletType.freighter:
      return "Stellar · Freighter Wallet";
    case WalletType.rabet:
      return "Stellar · Rabet Wallet";
    case WalletType.albedo:
      return "Stellar · Albedo Wallet";
    case WalletType.xBull:
      return "Stellar · xBull Wallet";
    case WalletType.hana:
      return "Stellar · Hana Wallet";
    case WalletType.hotWallet:
      return "Stellar · HOT Wallet";
    case WalletType.metamask:
      return "Stellar · MetaMask Wallet";
    case WalletType.walletConnect:
      return "Stellar · Lobstr Wallet";
    case WalletType.google:
      return "Action Account · Google";
    case WalletType.apple:
      return "Action Account · Apple";
    default:
      return "Action Account";
  }
}

// ─── Wallet button ────────────────────────────────────────────────────────────
function WalletButton({
  label,
  onClick,
  selected,
  tooltip,
  image,
  icon,
}: {
  label: string;
  onClick: () => void;
  selected: boolean;
  tooltip?: string;
  image?: string | StaticImageData;
  icon?: React.ReactNode;
}) {
  return (
    <div data-tip={tooltip} className={tooltip ? "tooltip w-full" : "w-full"}>
      <button
        onClick={onClick}
        className={clsx(
          "group font-display flex w-full items-center gap-2.5 rounded-[10px] border-2 px-3 py-2.5 text-[15px] tracking-[0.03em] uppercase transition-[transform,box-shadow] duration-100",
          "shadow-[3px_3px_0_0_var(--color-primary)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
          selected
            ? "bg-primary border-black text-black"
            : "bg-surface-2 text-foreground border-[var(--sticker-line,#f2f7f2)]",
        )}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-black bg-[#f2f7f2] text-black [&_svg]:size-4">
          {image ? (
            <Image src={image} alt="" width={22} height={22} className="object-contain" />
          ) : (
            icon
          )}
        </span>
        <span className="flex-1 text-left">{label}</span>
        {selected ? (
          <CheckCircle2 className="size-4 shrink-0 text-black" />
        ) : (
          <span className="font-display text-primary text-[13px]">GO →</span>
        )}
      </button>
    </div>
  );
}

/** Logo (hosted image or inline icon) shown on each wallet's connect button. */
const WALLET_BUTTON_ART: Partial<
  Record<WalletType, { image?: string | StaticImageData; icon?: React.ReactNode }>
> = {
  [WalletType.freighter]: { image: freighterLogo },
  [WalletType.rabet]: { image: rabetLogo },
  [WalletType.albedo]: { image: albedoLogo },
  [WalletType.xBull]: { image: xbullLogo },
  [WalletType.hana]: { icon: <HanaIcon /> },
  [WalletType.metamask]: { icon: <MetaMaskIcon /> },
  [WalletType.hotWallet]: { icon: <Wallet className="size-6" /> },
};

// ─── Main component ───────────────────────────────────────────────────────────
export function ConnectWalletDialog() {
  const [authView, setAuthView] = useState<AuthView>("login");
  const [activeTab, setActiveTab] = useState<"action" | "stellar">("action");
  const [isAccountActivate, setAccountActivate] = useState(false);
  const [isAccountActivateLoading, setAccountActivateLoading] = useState(false);
  const dialogModalState = useConnectWalletDialogStore();
  const [selectedWallet, setSelectedWallet] = useState(WalletType.none);
  const isIosFBuser = useFacebookIosUserAgent();
  const session = useSession();

  // True only inside the AR app's phone-shaped device frame (see the note on
  // AR_APP_FRAME_SELECTOR). Everywhere else `isFramedHost` stays false and the
  // dialog keeps its wide two-column layout below.
  const [frameContainer, setFrameContainer] = useState<HTMLElement | null>(null);
  const isFramedHost = frameContainer !== null;
  useEffect(() => {
    setFrameContainer(document.querySelector<HTMLElement>(AR_APP_FRAME_SELECTOR));
  }, []);

  const checkAccountActivity = useCallback(async (publicKey: string) => {
    setAccountActivateLoading(true);
    const isActive = await isStellarAccountActive(publicKey);
    setAccountActivate(isActive);
    setAccountActivateLoading(false);
  }, []);

  const checkStatus = useCallback(async () => {
    const user = session.data?.user;
    if (user) await checkAccountActivity(user.walletAddress);
  }, [checkAccountActivity, session.data?.user]);

  // Plain browser navigation, not next/router or next/navigation: this
  // package is shared by Pages-Router and App-Router apps.
  const disconnectWallet = useCallback(async () => {
    await signOut({ redirect: false });
    window.location.reload();
  }, []);

  function toolTipsAddr(walletType: WalletType) {
    const user = session.data?.user;
    if (user && selectedWallet === walletType) return abbreviateAddress(user.walletAddress, 10);
  }

  useEffect(() => {
    void checkStatus();
    const w = session.data?.user.walletType;
    setSelectedWallet(w ?? WalletType.none);
  }, [checkStatus, session.data?.user.walletType]);

  const handleClose = () => {
    dialogModalState.setIsOpen(false);
  };

  useEffect(() => {
    if (dialogModalState.isOpen) {
      setAuthView("login");
      setActiveTab("action");
    }
  }, [dialogModalState.isOpen]);

  const authUser =
    session.status === "authenticated" && !!session.data?.user.emailVerified && isAccountActivate;

  // ── Profile card ──
  // Who is signed in: a brand-colour cover with the avatar breaking out of it, the name, how they
  // signed in and their wallet address, plus copy and sign-out. The login tabs below it switch
  // to another account.
  function ProfileCard() {
    if (session.status !== "authenticated" || !session.data) return null;
    const user = session.data.user;
    const profile = dialogModalState.profile;
    const name =
      profile?.name ?? (user as { name?: string }).name ?? abbreviateAddress(user.walletAddress, 8);
    const image = profile?.image ?? (user as { image?: string | null }).image;
    const initials = name.slice(0, 2).toUpperCase();
    const walletLabel = getWalletLabel(user.walletType ?? "");
    return (
      <div className="bg-surface-2 relative shrink-0 overflow-hidden rounded-[14px] border-[2.5px] border-[var(--sticker-line,#f2f7f2)] p-3.5 shadow-[4px_4px_0_0_var(--color-primary)]">
        <div className="border-border relative mb-3 flex items-center gap-2 border-b pr-8 pb-2.5">
          <Image src={brandMark} alt="" width={22} height={22} />
          <span className="font-display text-foreground text-[15px] leading-none tracking-[0.05em]">
            ACTION-TOKENS
          </span>
          <span className="text-primary flex items-center gap-1.5 font-mono text-[9px] tracking-[0.16em] uppercase">
            <span className="bg-primary at-pulse size-1.5 rounded-full" />
            Action Auth System
          </span>
        </div>
        <div className="relative flex items-center gap-3">
          <div className="bg-primary font-display flex size-14 shrink-0 -rotate-3 items-center justify-center overflow-hidden rounded-full border-[3px] border-black text-[20px] text-black shadow-[2px_2px_0_0_var(--sticker-line,#f2f7f2)]">
            {image ? <img src={image} alt="" className="size-full object-cover" /> : initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display bg-primary inline-block -rotate-1 px-1.5 text-[11px] tracking-[0.06em] text-black">
              PLAYER ONE · {walletLabel.toUpperCase()}
            </p>
            <p className="font-display text-foreground mt-1 truncate text-[20px] leading-tight uppercase">
              {name}
            </p>
            <p className="text-muted-foreground font-mono text-xs">
              {abbreviateAddress(user.walletAddress, 6)}
            </p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <button
              onClick={() => {
                void toast.promise(navigator.clipboard.writeText(user.walletAddress), {
                  loading: "Copying…",
                  success: "Address copied",
                  error: "Failed to copy",
                });
              }}
              title="Copy wallet address"
              aria-label="Copy wallet address"
              className="flex size-9 items-center justify-center rounded-[10px] border-2 border-black bg-[#f2f7f2] text-black shadow-[2px_2px_0_0_var(--color-primary)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              <DocumentDuplicateIcon className="size-4" />
            </button>
            <button
              onClick={disconnectWallet}
              title="Sign out"
              aria-label="Sign out"
              className="bg-destructive flex size-9 items-center justify-center rounded-[10px] border-2 border-black text-white shadow-[2px_2px_0_0_var(--sticker-line,#f2f7f2)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Disconnect button ──
  function DisconnectButton() {
    if (session.status !== "authenticated") return null;
    return (
      <Button
        className="bg-destructive text-destructive-foreground hover:bg-destructive/90 w-full rounded-xl py-2.5"
        onClick={disconnectWallet}
      >
        <SignalSlashIcon className="mr-2 h-4 w-4" />
        Disconnect Wallet
      </Button>
    );
  }

  // ── Not activated state ──
  function NotActivatedUser() {
    if (isAccountActivateLoading) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <ArrowUpCircle className="text-muted-foreground h-8 w-8 animate-spin" />
          <p className="text-muted-foreground text-sm font-medium">Checking account status…</p>
        </div>
      );
    }
    if (session.data && !isAccountActivate) {
      return (
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <div className="bg-muted flex h-14 w-14 items-center justify-center rounded-full">
            <Wallet className="text-muted-foreground h-7 w-7" />
          </div>
          <div>
            <p className="text-base font-semibold">Account not activated</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Fund your Stellar account to activate it, then refresh.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const id = session.data.user.walletAddress;
                void navigator.clipboard
                  .writeText(id)
                  .then(() => toast.success("Copied: " + abbreviateAddress(id)));
              }}
            >
              <DocumentDuplicateIcon className="mr-1.5 h-3.5 w-3.5" />
              Copy address
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isAccountActivateLoading}
              onClick={() => void checkStatus()}
            >
              <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        </div>
      );
    }
    return null;
  }

  // ── Social auth buttons ──
  function SocialButtons() {
    const base =
      "font-display flex h-12 w-full items-center justify-center gap-2.5 rounded-[10px] text-[16px] tracking-[0.04em] uppercase transition-[transform,box-shadow] duration-100 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:opacity-50";
    return (
      <div className="flex flex-col gap-2.5">
        <button
          onClick={() => void googleProvider.login()}
          disabled={isIosFBuser ?? false}
          className={clsx(
            base,
            "border-[3px] border-black bg-[#f2f7f2] text-[#050605] shadow-[4px_4px_0_0_var(--color-primary)]",
          )}
        >
          <GoogleLogo />
          Continue with Google
        </button>
        <button
          onClick={() => void appleProvider.login()}
          className={clsx(
            base,
            "border-[2.5px] border-[var(--sticker-line,#f2f7f2)] bg-black text-white shadow-[4px_4px_0_0_var(--color-primary)]",
          )}
        >
          <AppleLogo />
          Continue with Apple
        </button>
      </div>
    );
  }

  // ── Action tab content ──
  function ActionTabContent() {
    const back = (
      <button
        type="button"
        onClick={() => setAuthView("login")}
        className="text-muted-foreground hover:text-primary-text flex items-center gap-1 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" /> Back
      </button>
    );
    return (
      <div className="flex flex-col gap-4">
        {authView === "login" && (
          <>
            <SocialButtons />
            <Divider label="or with email" />
            <EmailLoginForm onForgotPassword={() => setAuthView("forgot-password")} />
            {/* already signed in: switching accounts doesn't need the sign-up prompt */}
            {!authUser && (
              <p className="text-muted-foreground text-center text-sm">
                New here?{" "}
                <button
                  type="button"
                  onClick={() => setAuthView("signup")}
                  className="text-primary-text font-semibold hover:underline"
                >
                  Create an account
                </button>
              </p>
            )}
          </>
        )}
        {authView === "signup" && (
          <>
            {back}
            <EmailSignUpForm onSuccess={() => setAuthView("login")} />
          </>
        )}
        {authView === "forgot-password" && (
          <>
            {back}
            <ForgotPasswordForm />
          </>
        )}
      </div>
    );
  }

  // ── Stellar wallets grid ──
  function StellarTabContent() {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-fg-faint text-xs">
          You only sign a message to sign in. Nothing is sent.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {NON_CUSTODIAL_PROVIDERS.map((provider) => (
            <WalletButton
              key={provider.type}
              label={provider.label}
              onClick={() => void provider.login()}
              selected={selectedWallet === provider.type}
              tooltip={toolTipsAddr(provider.type)}
              {...WALLET_BUTTON_ART[provider.type]}
            />
          ))}
          {/* Lobstr (WalletConnect): the only way to reach it in the phone frame and on narrow
              screens, where the brand panel with its QR card is hidden. */}
          <div className={isFramedHost ? undefined : "lg:hidden"}>
            <WCButton
              toolTipsAddr={toolTipsAddr}
              selectedWallet={selectedWallet}
              text="Lobstr"
              inGrid
            />
          </div>
        </div>
      </div>
    );
  }

  const onWallets = activeTab === "stellar";
  return (
    <Dialog open={dialogModalState.isOpen} onOpenChange={handleClose}>
      {/* Signed in but the Stellar account isn't funded yet: a compact card */}
      {session.status === "authenticated" &&
      session.data?.user.emailVerified &&
      !isAccountActivateLoading &&
      !isAccountActivate ? (
        <DialogContent
          portalContainer={frameContainer}
          className="bg-surface max-w-sm rounded-[20px] border-[3px] border-[var(--sticker-line,#f2f7f2)] p-6 shadow-[6px_6px_0_0_var(--color-primary)]"
        >
          <DialogTitle className="sr-only">Account status</DialogTitle>
          <NotActivatedUser />
          <div className="mt-4">
            <DisconnectButton />
          </div>
        </DialogContent>
      ) : (
        /* One column in the AR phone frame and on phones; on wide screens a brand panel
           (with the Lobstr QR card) sits on the left. `isFramedHost` decides, because the
           frame is narrow even on a wide screen and lg: keys off the real viewport. */
        <DialogContent
          portalContainer={frameContainer}
          className={clsx(
            "bg-surface gap-0 overflow-hidden border-[3px] border-[var(--sticker-line,#f2f7f2)] p-0 shadow-[6px_6px_0_0_var(--color-primary)]",
            isFramedHost
              ? "mx-auto flex max-h-[88vh] w-full max-w-[420px] flex-col rounded-[22px]"
              : // On wide screens the dialog has a set height and one row that fits it, so the
                // sign-in column scrolls inside it and the brand panel never runs past the edge.
                "flex max-h-[92dvh] max-w-[860px] rounded-[22px] lg:grid lg:h-[min(92dvh,760px)] lg:grid-cols-[330px_1fr] lg:grid-rows-[minmax(0,1fr)]",
          )}
        >
          {/* ── Brand panel (wide screens) ── */}
          <aside
            className={clsx(
              "border-border relative min-h-0 flex-col justify-between gap-6 overflow-hidden border-r bg-black p-7",
              isFramedHost ? "hidden" : "hidden lg:flex",
            )}
          >
            <div aria-hidden className="at-grid absolute inset-0" />
            <div aria-hidden className="at-scanlines absolute inset-0 opacity-60" />
            <div
              aria-hidden
              className="absolute -bottom-24 left-1/2 h-56 w-[140%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgb(77_255_42/0.35),transparent)]"
            />
            <div className="relative">
              <Image src={brandMark} alt="Action-Tokens" width={64} height={64} priority />
              <p className="font-neon at-neon-text mt-4 text-2xl">Welcome</p>
              <p className="font-shade mt-3 text-[44px] leading-[0.95] text-white">
                ACTION-
                <br />
                TOKENS
              </p>
              <p className="font-pixel mt-4 text-[11px] leading-relaxed tracking-widest text-white/60">
                DISCOVER · ACT · PROVE
                <br />
                EARN · FLEX
              </p>
            </div>
            <div className="relative">
              <div className="rounded-[14px] border border-white/15 bg-[#0a0d0a]/90 p-4">
                <div className="flex items-center gap-2">
                  <QrCodeIcon className="size-5 text-[#3dff76]" />
                  <p className="font-brand text-sm text-white">Scan with Lobstr</p>
                </div>
                <p className="mt-1 text-xs text-white/60">
                  Connect your phone wallet with a QR code.
                </p>
                <div className="mt-3">
                  <WCButton
                    toolTipsAddr={toolTipsAddr}
                    selectedWallet={selectedWallet}
                    text="Continue with Lobstr"
                    onDark
                  />
                </div>
              </div>
            </div>
          </aside>

          {/* ── Sign-in column ── */}
          <div
            className={clsx(
              "flex min-h-0 w-full flex-1 flex-col gap-5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
              isFramedHost ? "px-5 pt-8 pb-5" : "p-6 sm:p-8",
            )}
          >
            {/* first child: its negative margins reach the column's edges */}
            {/* signed in: the brand row lives inside the profile card instead */}
            {!authUser && <BrandHeader framed={isFramedHost} />}

            {session.data?.user && !session.data.user.emailVerified && (
              <div className="border-warning/40 bg-warning/10 rounded-[12px] border p-4">
                <p className="text-foreground text-sm font-semibold">{session.data.user.email}</p>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  Check your inbox and verify your email to continue.
                </p>
                <Button size="sm" variant="outline" className="mt-3" onClick={disconnectWallet}>
                  <SignalSlashIcon className="mr-1.5 size-3.5" />
                  Sign out
                </Button>
              </div>
            )}

            {authUser && <ProfileCard />}

            <DialogTitle className="sr-only">
              {onWallets ? "Stellar wallet" : authUser ? "Use another account" : "Sign in"}
            </DialogTitle>

            {onWallets ? <StellarTabContent /> : <ActionTabContent />}

            {/* The other way in, one tap away */}
            {authView === "login" && (
              <button
                type="button"
                onClick={() => setActiveTab(onWallets ? "action" : "stellar")}
                className="group bg-surface-2 relative mt-auto flex -rotate-1 items-center gap-3 rounded-[12px] border-[2.5px] border-[var(--sticker-line,#f2f7f2)] px-4 py-3 text-left shadow-[4px_4px_0_0_var(--color-primary)] transition-[transform,box-shadow] duration-100 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
              >
                <span
                  aria-hidden
                  className="absolute -top-2 left-1/2 h-4 w-12 -translate-x-1/2 rotate-3 bg-[#f2f7f2]/70"
                />
                <span className="bg-primary flex size-9 items-center justify-center rounded-full border-2 border-black text-black">
                  {onWallets ? <ArrowLeft className="size-4" /> : <Wallet className="size-4" />}
                </span>
                <span className="flex-1">
                  <span className="font-display block text-[16px] leading-tight tracking-[0.03em] uppercase">
                    {onWallets ? "Use email, Google or Apple" : "I have a Stellar wallet"}
                  </span>
                  {onWallets ? (
                    <LogoStack items={ACCOUNT_STACK} />
                  ) : (
                    <LogoStack
                      items={WALLET_STACK}
                      more={NON_CUSTODIAL_PROVIDERS.length + 1 - WALLET_STACK.length}
                    />
                  )}
                </span>
                <span className="font-display bg-primary rotate-3 border-2 border-black px-1.5 py-0.5 text-[12px] text-black">
                  {onWallets ? "BACK" : "NEXT"}
                </span>
              </button>
            )}

            <p className="text-fg-faint text-center text-[11px]">
              By continuing you agree to the Action-Tokens terms.
            </p>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

function GoogleLogo({ className = "size-[18px]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

function AppleLogo({ className = "size-[18px]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 384 512" fill="currentColor" aria-hidden>
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

type StackItem = { name: string; image?: StaticImageData; icon?: React.ReactNode };

/** The Stellar wallets we support. */
const WALLET_STACK: StackItem[] = [
  { name: "Freighter", image: freighterLogo },
  { name: "xBull", image: xbullLogo },
  { name: "Lobstr", image: lobstrLogo },
  { name: "Albedo", image: albedoLogo },
  { name: "Rabet", image: rabetLogo },
  { name: "Hana", icon: <HanaIcon /> },
];

/** The ways in that need no wallet: email, Google, Apple. */
const ACCOUNT_STACK: StackItem[] = [
  { name: "Email", icon: <Mail className="text-primary-text" /> },
  { name: "Google", icon: <GoogleLogo className="size-4" /> },
  { name: "Apple", icon: <AppleLogo className="size-4 text-white" /> },
];

/** Logos as an overlapping row of circles, with "+N" for the rest. */
function LogoStack({ items, more = 0 }: { items: StackItem[]; more?: number }) {
  return (
    <span className="mt-1.5 flex items-center" aria-label={items.map((w) => w.name).join(", ")}>
      {items.map((item, i) => (
        <span
          key={item.name}
          title={item.name}
          style={{ zIndex: items.length - i }}
          className="ring-surface relative -ml-2 flex size-8 items-center justify-center overflow-hidden rounded-full bg-[#1a221a] ring-2 first:ml-0 [&_svg]:size-4"
        >
          {item.image ? (
            <Image src={item.image} alt="" width={20} height={20} className="object-contain" />
          ) : (
            item.icon
          )}
        </span>
      ))}
      {more > 0 && (
        <span className="ring-surface bg-surface-3 text-muted-foreground relative -ml-2 flex size-8 items-center justify-center rounded-full font-mono text-[10px] ring-2">
          +{more}
        </span>
      )}
    </span>
  );
}

/**
 * Who is asking you to sign in, as a slim radar strip: a small sweeping radar with the
 * ActionTokens pin pinging on the left, the "Action Auth System" readout and the wordmark on
 * the right, AR-camera corners. It bleeds to the dialog edges (the negative margins undo the
 * column padding). Still for reduced motion.
 */
function BrandHeader({ framed }: { framed: boolean }) {
  return (
    <div
      className={clsx(
        "relative flex h-[96px] shrink-0 items-center gap-3.5 overflow-hidden border-b-[3px] border-[var(--sticker-line,#f2f7f2)] bg-black pr-12",
        "bg-[radial-gradient(color-mix(in_oklab,var(--color-primary)_14%,transparent)_1px,transparent_1.4px)] [background-size:8px_8px]",
        framed ? "-mx-5 -mt-8 pl-5" : "-mx-6 -mt-6 pl-6 sm:-mx-8 sm:-mt-8 sm:pl-8",
      )}
    >
      <span className="relative flex size-14 shrink-0 -rotate-6 items-center justify-center rounded-full border-[3px] border-black bg-[#f2f7f2] shadow-[3px_3px_0_0_var(--color-primary)]">
        <Image src={brandMark} alt="" width={36} height={36} priority />
      </span>
      <span className="relative flex min-w-0 flex-col items-start gap-1.5">
        <span className="font-display bg-primary inline-block -rotate-2 border-[2.5px] border-black px-2 py-0.5 text-[22px] leading-none tracking-[0.03em] text-black shadow-[3px_3px_0_0_var(--sticker-line,#f2f7f2)]">
          ACTION-TOKENS
        </span>
        <span className="font-display ml-2 inline-block rotate-2 bg-[#f2f7f2] px-1.5 py-[3px] text-[11px] leading-none tracking-[0.1em] text-black">
          ACTION AUTH SYSTEM
        </span>
      </span>
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="bg-border h-px flex-1" />
      <span className="font-display text-muted-foreground text-[12px] tracking-[0.1em] uppercase">
        {label}
      </span>
      <span className="bg-border h-px flex-1" />
    </div>
  );
}

// ─── WalletConnect button ─────────────────────────────────────────────────────
function WCButton({
  toolTipsAddr,
  selectedWallet,
  text,
  onDark = false,
  inGrid = false,
}: {
  toolTipsAddr: (walletType: WalletType) => string | undefined;
  selectedWallet: WalletType;
  text?: string;
  onDark?: boolean;
  inGrid?: boolean;
}) {
  const [initializing, setInitializing] = useState(true);
  const [wcLoading, setWcLoading] = useState(false);
  const walletConnectModal = useWalletConnectModalStore();

  async function onInitialize() {
    try {
      await configureWalletConnectClient();
      setInitializing(false);
    } catch (e) {
      console.error(e);
    }
  }

  const isSelected = selectedWallet === WalletType.walletConnect;
  const tooltip = toolTipsAddr(WalletType.walletConnect);

  return (
    <div data-tip={tooltip} className={tooltip ? "tooltip w-full" : "w-full"}>
      <button
        disabled={wcLoading}
        onClick={() => {
          const runner = async () => {
            setWcLoading(true);
            if (initializing) {
              await import("@web3modal/ui");
              await onInitialize();
            }
            setWcLoading(false);
            walletConnectModal.setIsOpen(true);
            await walletConnectProvider.login();
            walletConnectModal.setIsOpen(false);
            toast("WalletConnect session ended");
          };
          void runner();
        }}
        className={clsx(
          "font-display flex w-full items-center gap-2.5 rounded-[10px] border-2 text-[15px] tracking-[0.03em] uppercase transition-[transform,box-shadow] duration-100 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:opacity-60",
          inGrid ? "px-3 py-2.5" : "justify-center px-4 py-2.5",
          isSelected
            ? "bg-primary border-black text-black shadow-[3px_3px_0_0_var(--sticker-line,#f2f7f2)]"
            : onDark
              ? "bg-primary border-black text-black shadow-[3px_3px_0_0_var(--sticker-line,#f2f7f2)]"
              : "bg-surface-2 text-foreground border-[var(--sticker-line,#f2f7f2)] shadow-[3px_3px_0_0_var(--color-primary)]",
        )}
      >
        <span
          className={clsx(
            "flex shrink-0 items-center justify-center rounded-full border-2 border-black bg-[#f2f7f2]",
            inGrid ? "size-7" : "size-6",
          )}
        >
          <Image
            src={lobstrLogo}
            alt="Lobstr"
            width={inGrid ? 22 : 18}
            height={inGrid ? 22 : 18}
            className="rounded-full object-contain"
          />
        </span>
        {text && (
          <span className="whitespace-nowrap">
            {wcLoading && initializing ? "Initializing…" : text}
          </span>
        )}
        {isSelected && <CheckCircle2 className="h-4 w-4 shrink-0 text-black" />}
      </button>
    </div>
  );
}
