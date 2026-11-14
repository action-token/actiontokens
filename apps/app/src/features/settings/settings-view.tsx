"use client";

import { Camera, Check, Copy, ImagePlus, Loader2, Settings, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { Label } from "@bandcoin/ui/components/label";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { Switch } from "@bandcoin/ui/components/switch";
import { Textarea } from "@bandcoin/ui/components/textarea";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { PageBody } from "@bandcoin/ui/patterns/page-header";
import { abbreviateAddress } from "@bandcoin/utils/address";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { ThemeSwitch } from "~/components/theme-switch";
import { Avatar } from "~/features/shell/context-panel";
import { lastFmErrorText } from "~/lib/lastfm-errors";
import { declare, putToStorage } from "~/lib/upload";
import { api, type RouterOutputs } from "~/trpc/react";

import { DeleteAccount } from "./delete-account";

type Settings = RouterOutputs["account"]["settings"];

/**
 * Fan settings, laid out like the public profile page: a full-width banner
 * with the cover and the fan's own details (live as they type), then the
 * forms and accounts under it.
 */
export function SettingsView() {
  const { status } = useSession();
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const settings = api.account.settings.useQuery(undefined, {
    enabled: status === "authenticated",
  });

  if (status === "unauthenticated") {
    return (
      <PageBody>
        <EmptyState
          icon={Settings}
          title="Sign in to open your settings"
          description="Your profile, connected accounts and wallet live here."
          action={<Button onClick={() => openSignIn(true)}>Sign in</Button>}
        />
      </PageBody>
    );
  }
  if (!settings.data) return <Skeleton className="h-[320px] rounded-none" />;
  return <Loaded settings={settings.data} />;
}

function Loaded({ settings }: { settings: Settings }) {
  const form = useProfileForm(settings);
  return (
    <>
      <Hero settings={settings} form={form} />
      <PageBody wide className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <ProfileCard settings={settings} form={form} />
        <div className="grid gap-6">
          <ConnectedAccounts settings={settings} />
          <WalletAndSecurity settings={settings} />
          <Card title="Appearance" note="Light, dark, or follow your device.">
            <ThemeSwitch />
          </Card>
          <Card
            title="Delete account"
            note="Removes your profile and sign-in for good. Artists and wallets that still hold funds need our help."
          >
            <div>
              <DeleteAccount />
            </div>
          </Card>
        </div>
      </PageBody>
    </>
  );
}

function Card({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="bg-surface grid gap-4 rounded-2xl border p-5 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {note && <p className="text-fg-muted text-sm">{note}</p>}
      </div>
      {children}
    </section>
  );
}

type Notice = { tone: "ok" | "error"; text: string } | null;

/** The edits in progress, shared by the banner (preview) and the form (inputs). */
function useProfileForm(settings: Settings) {
  const [displayName, setDisplayName] = useState(settings.displayName ?? "");
  const [bio, setBio] = useState(settings.bio ?? "");
  const [showCollection, setShowCollection] = useState(settings.showCollection);
  const [username, setUsername] = useState(settings.username ?? "");
  const [notice, setNotice] = useState<Notice>(null);
  return {
    displayName,
    setDisplayName,
    bio,
    setBio,
    showCollection,
    setShowCollection,
    username,
    setUsername,
    notice,
    setNotice,
  };
}
type Form = ReturnType<typeof useProfileForm>;

const handleOf = (value: string) => value.trim().replace(/^@/, "").toLowerCase();

/** Picks an image, uploads it straight to storage, then saves its address. */
function useImageUpload(
  save: (url: string) => Promise<unknown>,
  onError: (message: string) => void,
) {
  const utils = api.useUtils();
  const sign = api.account.imageUpload.useMutation();
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const declared = await declare(file);
      const signed = await sign.mutateAsync(declared);
      await putToStorage(file, signed, declared.checksum);
      await save(signed.fileUrl);
      await Promise.all([utils.account.settings.invalidate(), utils.account.me.invalidate()]);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Couldn't upload the picture.");
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }
  return {
    uploading,
    open: () => input.current?.click(),
    inputProps: {
      ref: input,
      type: "file" as const,
      accept: "image/jpeg,image/png,image/webp,image/gif",
      hidden: true,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => void pick(event.target.files?.[0]),
    },
  };
}

function Hero({ settings, form }: { settings: Settings; form: Form }) {
  const utils = api.useUtils();
  const setAvatar = api.account.setAvatar.useMutation();
  const setCover = api.account.setCover.useMutation();
  const fail = (text: string) => form.setNotice({ tone: "error", text });
  const avatar = useImageUpload((url) => setAvatar.mutateAsync({ url }), fail);
  const cover = useImageUpload((url) => setCover.mutateAsync({ url }), fail);

  const typed = form.displayName.trim();
  const name = typed === "" ? (settings.username ?? "You") : typed;
  const handle = handleOf(form.username);

  return (
    <section className="bleed relative isolate flex min-h-[280px] items-end overflow-hidden text-white sm:min-h-[320px]">
      {settings.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- images come from many hosts
        <img
          src={settings.coverUrl}
          alt=""
          aria-hidden
          className="absolute inset-0 -z-20 size-full object-cover"
        />
      ) : settings.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- images come from many hosts
        <img
          src={settings.avatarUrl}
          alt=""
          aria-hidden
          className="absolute inset-0 -z-20 size-full scale-125 object-cover blur-2xl"
        />
      ) : (
        <div aria-hidden className="bg-primary absolute inset-0 -z-20" />
      )}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/45 to-black/10"
      />

      <div className="absolute top-4 right-4 flex flex-wrap justify-end gap-2 sm:right-8">
        <input {...cover.inputProps} />
        <Button size="sm" variant="secondary" disabled={cover.uploading} onClick={cover.open}>
          <ImagePlus />{" "}
          {cover.uploading ? "Uploading…" : settings.coverUrl ? "Change cover" : "Add cover"}
        </Button>
        {settings.coverUrl && (
          <Button
            size="sm"
            variant="secondary"
            disabled={setCover.isPending}
            onClick={() =>
              void setCover
                .mutateAsync({ url: null })
                .then(() => utils.account.settings.invalidate())
            }
          >
            <X /> Remove cover
          </Button>
        )}
      </div>

      <div className="grid w-full max-w-[var(--page-max,96rem)] gap-5 px-4 pt-16 pb-7 sm:px-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
          <div className="relative shrink-0">
            <Avatar
              name={name}
              url={settings.avatarUrl}
              className="bg-surface-3 text-fg grid size-24 shrink-0 place-items-center rounded-full border-4 border-white object-cover text-3xl font-bold shadow-xl lg:size-32"
            />
            <input {...avatar.inputProps} />
            <button
              type="button"
              aria-label="Change picture"
              disabled={avatar.uploading}
              onClick={avatar.open}
              className="bg-primary text-primary-foreground absolute right-0 bottom-0 grid size-9 place-items-center rounded-full border-2 border-white shadow-lg disabled:opacity-60"
            >
              <Camera className="size-4" />
            </button>
          </div>
          <div className="grid min-w-0 flex-1 gap-1">
            <span className="marker -rotate-1 text-lg text-white/80">*your profile*</span>
            <h1 className="display text-5xl break-words sm:text-6xl xl:text-7xl">{name}</h1>
            <p className="text-sm text-white/75">
              {handle ? `@${handle}` : "Pick a username below"}
            </p>
            {form.bio.trim() && (
              <p className="marker max-w-2xl -rotate-1 text-lg text-white/85">{form.bio.trim()}</p>
            )}
          </div>
          {settings.username && (
            <Link
              href={`/u/${settings.username}`}
              className="flex h-10 items-center rounded-full bg-white/15 px-4 text-sm font-semibold backdrop-blur hover:bg-white/25"
            >
              View public page
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

function ProfileCard({ settings, form }: { settings: Settings; form: Form }) {
  const utils = api.useUtils();
  const save = api.account.updateProfile.useMutation();
  const rename = api.account.setUsername.useMutation();
  const {
    displayName,
    setDisplayName,
    bio,
    setBio,
    showCollection,
    setShowCollection,
    username,
    setUsername,
    notice,
    setNotice,
  } = form;

  const changeLocked =
    settings.usernameChangeOpensAt !== null &&
    new Date(settings.usernameChangeOpensAt) > new Date();
  const usernameChanged = handleOf(username) !== (settings.username ?? "");
  const saving = save.isPending || rename.isPending;

  async function onSave() {
    setNotice(null);
    try {
      await save.mutateAsync({ displayName, bio, showCollection });
      if (usernameChanged && username.trim()) await rename.mutateAsync({ username });
      setNotice({ tone: "ok", text: "Saved." });
      // Refresh in the background: the balances behind `account.me` take a few seconds.
      void Promise.all([utils.account.settings.invalidate(), utils.account.me.invalidate()]);
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Couldn't save. Try again.",
      });
    }
  }

  return (
    <Card title="Profile" note="What people see on your public page.">
      <div className="grid gap-1.5">
        <Label htmlFor="displayName">Display name</Label>
        <Input
          id="displayName"
          value={displayName}
          maxLength={40}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="username">Username</Label>
        <div className="flex items-center gap-2">
          <span className="text-fg-muted">@</span>
          <Input
            id="username"
            value={username}
            maxLength={20}
            disabled={changeLocked}
            onChange={(event) => setUsername(event.target.value)}
          />
        </div>
        <p className="text-fg-faint text-xs">
          {changeLocked
            ? `You can change it again on ${new Date(settings.usernameChangeOpensAt!).toLocaleDateString("en-US", { dateStyle: "medium" })}.`
            : `Your public page is /u/${handleOf(username) || "your-name"}. You can change it once every 30 days.`}
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="bio">Bio</Label>
        <Textarea
          id="bio"
          value={bio}
          maxLength={280}
          rows={3}
          onChange={(event) => setBio(event.target.value)}
        />
        <span className="text-fg-faint text-right text-xs">{bio.length}/280</span>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="showCollection">Show my collection publicly</Label>
          <p className="text-fg-faint text-xs">Anyone can see what you own on your public page.</p>
        </div>
        <Switch id="showCollection" checked={showCollection} onCheckedChange={setShowCollection} />
      </div>

      <div className="flex items-center gap-3">
        <Button disabled={saving || displayName.trim() === ""} onClick={() => void onSave()}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
        {notice && (
          <span
            role="status"
            className={notice.tone === "ok" ? "text-success text-sm" : "text-danger text-sm"}
          >
            {notice.text}
          </span>
        )}
      </div>
    </Card>
  );
}

function ConnectedAccounts({ settings }: { settings: Settings }) {
  const utils = api.useUtils();
  const disconnect = api.bounty.disconnectLastFm.useMutation({
    onSuccess: () => utils.account.settings.invalidate(),
  });

  // Back from Last.fm: say how it went, refresh the card, then tidy the URL.
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const connected = params.get("lastfm") === "connected";
  const failure = params.get("error");
  useEffect(() => {
    if (!connected && !failure) return;
    if (connected) {
      toast.success("Last.fm account connected!", { id: "lastfm" });
      void utils.account.settings.invalidate();
    } else if (failure) toast.error(lastFmErrorText(failure), { id: "lastfm" });
    router.replace(pathname);
  }, [connected, failure, pathname, router, utils]);

  return (
    <Card title="Connected accounts" note="Last.fm lets bounties count the songs you play.">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <b className="text-sm">Last.fm</b>
          <p className="text-fg-muted truncate text-sm">
            {settings.lastFm ? (
              <>
                Connected as{" "}
                <a
                  href={settings.lastFm.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {settings.lastFm.username}
                </a>
              </>
            ) : (
              "Not connected"
            )}
          </p>
        </div>
        {settings.lastFm ? (
          <Button
            variant="secondary"
            disabled={disconnect.isPending}
            onClick={() => disconnect.mutate()}
          >
            {disconnect.isPending && <Loader2 className="animate-spin" />}
            Disconnect
          </Button>
        ) : (
          <Button asChild variant="secondary">
            <a href={`/api/lastfm/auth?redirect=%2Fsettings`}>Connect</a>
          </Button>
        )}
      </div>
    </Card>
  );
}

function WalletAndSecurity({ settings }: { settings: Settings }) {
  const [copied, setCopied] = useState(false);
  const signInMethod = settings.custodial
    ? (settings.email ?? "Email or social sign-in")
    : settings.walletType;

  return (
    <Card title="Wallet and security" note="The Stellar wallet your purchases and prizes go to.">
      <dl className="grid gap-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-fg-muted">Address</dt>
          <dd>
            <button
              type="button"
              className="hover:text-fg flex items-center gap-1.5 font-mono text-xs"
              onClick={() =>
                void navigator.clipboard.writeText(settings.walletAddress).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                })
              }
            >
              {abbreviateAddress(settings.walletAddress, 8)}
              {copied ? <Check className="text-success size-3.5" /> : <Copy className="size-3.5" />}
              <span className="sr-only">{copied ? "Copied" : "Copy address"}</span>
            </button>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-fg-muted">Signed in with</dt>
          <dd className="truncate capitalize">{signInMethod}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-fg-muted">Payments</dt>
          <dd>
            {settings.custodial
              ? "Sent after a 5 second countdown you can cancel"
              : "You confirm each one in your wallet"}
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary">
          <Link href="/wallet">Open wallet</Link>
        </Button>
        <Button variant="secondary" onClick={() => void signOut({ callbackUrl: "/" })}>
          Sign out
        </Button>
      </div>
    </Card>
  );
}
