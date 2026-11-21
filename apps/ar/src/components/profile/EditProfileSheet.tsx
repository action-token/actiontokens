"use client";

import { Camera, ImagePlus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@actiontokens/ui/lib/cn";

import { ArButton } from "~/components/ui/ArButton";
import { BottomSheet } from "~/components/ui/BottomSheet";
import { declare, putToStorage } from "~/lib/upload";
import { api } from "~/trpc/react";

const handleOf = (value: string) => value.trim().replace(/^@/, "").toLowerCase();
const BIO_MAX = 280;

type Which = "avatar" | "cover";

/**
 * Edit your own profile from AR: cover, avatar, name, bio, username and whether your collection
 * is public. Uses the same `account` procedures as the fan app's Settings, so both stay in sync.
 */
export function EditProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = api.useUtils();
  const settings = api.account.settings.useQuery(undefined, {
    enabled: open,
    staleTime: 0,
  });
  const save = api.account.updateProfile.useMutation();
  const rename = api.account.setUsername.useMutation();
  const sign = api.account.imageUpload.useMutation();
  const setAvatar = api.account.setAvatar.useMutation();
  const setCover = api.account.setCover.useMutation();

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [username, setUsername] = useState("");
  const [showCollection, setShowCollection] = useState(true);
  const [uploading, setUploading] = useState<Which | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  // Fill the form once per open, from the server's copy.
  const filled = useRef(false);
  useEffect(() => {
    if (!open) {
      filled.current = false;
      return;
    }
    const s = settings.data;
    if (!s || filled.current) return;
    filled.current = true;
    setDisplayName(s.displayName ?? "");
    setBio(s.bio ?? "");
    setUsername(s.username ?? "");
    setShowCollection(s.showCollection);
    setNotice(null);
  }, [open, settings.data]);

  const s = settings.data;
  const locked = s?.usernameChangeOpensAt ? new Date(s.usernameChangeOpensAt) > new Date() : false;
  const usernameChanged = s ? handleOf(username) !== (s.username ?? "") : false;
  const saving = save.isPending || rename.isPending;

  const refresh = () =>
    Promise.all([utils.account.settings.invalidate(), utils.account.me.invalidate()]);

  async function upload(which: Which, file: File | undefined) {
    if (!file) return;
    setUploading(which);
    setNotice(null);
    try {
      const declared = await declare(file);
      const signed = await sign.mutateAsync(declared);
      await putToStorage(file, signed, declared.checksum);
      if (which === "avatar") await setAvatar.mutateAsync({ url: signed.fileUrl });
      else await setCover.mutateAsync({ url: signed.fileUrl });
      await refresh();
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Couldn't upload the picture.",
      });
    } finally {
      setUploading(null);
      const el = which === "avatar" ? avatarInput.current : coverInput.current;
      if (el) el.value = "";
    }
  }

  async function removeCover() {
    setNotice(null);
    try {
      await setCover.mutateAsync({ url: null });
      await refresh();
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Couldn't remove the cover.",
      });
    }
  }

  async function onSave() {
    setNotice(null);
    try {
      await save.mutateAsync({ displayName, bio, showCollection });
      if (usernameChanged && username.trim()) await rename.mutateAsync({ username });
      await refresh();
      onClose();
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Couldn't save. Try again.",
      });
    }
  }

  const field =
    "ar-bevel rounded-ar text-ar-text placeholder:text-ar-faint w-full bg-transparent px-3.5 text-[14px] outline-hidden focus:border-[hsl(var(--ar-accent))]";
  const label =
    "font-hud text-ar-dim mb-1.5 block text-[10.5px] font-semibold tracking-[0.16em] uppercase";
  const imageAttrs = {
    type: "file" as const,
    accept: "image/jpeg,image/png,image/webp,image/gif",
    hidden: true,
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      labelledBy="edit-profile-title"
      className="flex max-h-[92%] flex-col"
    >
      {!s && (
        <div className="flex items-center justify-between px-5 pt-1 pb-3">
          <h2
            id="edit-profile-title"
            className="font-display text-ar-text text-[26px] leading-none uppercase"
          >
            Edit profile
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ar-glass text-ar-text flex h-9 w-9 items-center justify-center rounded-full"
          >
            <X size={16} strokeWidth={2.4} />
          </button>
        </div>
      )}

      <div className="ar-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-3">
        {settings.isPending ? (
          <p className="text-ar-dim py-10 text-center text-[13px]">Loading…</p>
        ) : settings.isError || !s ? (
          <div className="py-10 text-center">
            <p className="text-ar-dim text-[13px]">Couldn&apos;t load your profile.</p>
            <ArButton size="sm" className="mt-3" onClick={() => void settings.refetch()}>
              Try again
            </ArButton>
          </div>
        ) : (
          <>
            {/* Cover + avatar: pinned, so the title and Close stay on top while the form scrolls */}
            <div className="bg-ar-surface sticky top-0 z-10 -mx-5 px-5 pb-2">
              <div className="rounded-ar relative h-[168px] overflow-hidden border-2 border-[hsl(var(--st-line)/0.85)]">
                {s.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.coverUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="from-ar-accent/70 via-ar-accent/25 to-ar-surface-2 h-full w-full bg-linear-to-br" />
                )}
                <div className="from-ar-void/70 absolute inset-x-0 top-0 h-20 bg-linear-to-b to-transparent" />
                <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
                  <h2
                    id="edit-profile-title"
                    className="st-green font-display -rotate-2 px-2.5 pt-[5px] pb-[3px] text-[20px] leading-none tracking-[0.06em] uppercase shadow-[2px_2px_0_0_hsl(var(--st-ink))]"
                  >
                    Edit profile
                  </h2>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="ar-glass text-ar-text flex h-9 w-9 items-center justify-center rounded-full"
                  >
                    <X size={16} strokeWidth={2.4} />
                  </button>
                </div>
                <div className="absolute right-2 bottom-2 flex gap-2">
                  {s.coverUrl && (
                    <button
                      type="button"
                      onClick={() => void removeCover()}
                      aria-label="Remove cover"
                      className="ar-glass text-ar-text flex h-9 w-9 items-center justify-center rounded-full"
                    >
                      <Trash2 size={15} strokeWidth={2.4} />
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={uploading === "cover"}
                    onClick={() => coverInput.current?.click()}
                    className="st-green font-hud flex h-9 items-center gap-1.5 rounded-[10px] px-3 text-[11px] font-semibold tracking-[0.1em] uppercase shadow-[2px_2px_0_0_hsl(var(--st-ink))]"
                  >
                    <ImagePlus size={14} strokeWidth={2.6} />
                    {uploading === "cover"
                      ? "Uploading…"
                      : s.coverUrl
                        ? "Change cover"
                        : "Add cover"}
                  </button>
                </div>
              </div>
              <input
                {...imageAttrs}
                ref={coverInput}
                onChange={(e) => void upload("cover", e.target.files?.[0])}
              />

              <div className="-mt-10 flex items-end gap-3 px-3">
                <div className="relative shrink-0">
                  {s.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.avatarUrl}
                      alt=""
                      className="h-[72px] w-[72px] rounded-[20px] border-[3px] border-[hsl(var(--st-ink))] object-cover shadow-[3px_3px_0_0_hsl(var(--st-pop))]"
                    />
                  ) : (
                    <span className="bg-ar-surface-2 block h-[72px] w-[72px] rounded-[20px] border-[3px] border-[hsl(var(--st-ink))]" />
                  )}
                  <button
                    type="button"
                    disabled={uploading === "avatar"}
                    onClick={() => avatarInput.current?.click()}
                    aria-label="Change avatar"
                    className="st-green absolute -right-2 -bottom-2 flex h-8 w-8 items-center justify-center rounded-full shadow-[2px_2px_0_0_hsl(var(--st-ink))]"
                  >
                    <Camera size={14} strokeWidth={2.6} />
                  </button>
                </div>
                {uploading === "avatar" && (
                  <p className="font-hud text-ar-dim pb-1 text-[11px] tracking-[0.12em] uppercase">
                    Uploading…
                  </p>
                )}
              </div>
              <input
                {...imageAttrs}
                ref={avatarInput}
                onChange={(e) => void upload("avatar", e.target.files?.[0])}
              />
            </div>

            <div>
              <label htmlFor="ep-name" className={label}>
                Name
              </label>
              <input
                id="ep-name"
                value={displayName}
                maxLength={40}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className={cn(field, "h-11")}
              />
            </div>

            <div>
              <label htmlFor="ep-username" className={label}>
                Username
              </label>
              <input
                id="ep-username"
                value={username}
                disabled={locked}
                maxLength={60}
                autoCapitalize="none"
                autoCorrect="off"
                onChange={(e) => setUsername(e.target.value)}
                placeholder="username"
                className={cn(field, "h-11 disabled:opacity-60")}
              />
              <p className="text-ar-faint mt-1 text-[11.5px]">
                {locked && s.usernameChangeOpensAt
                  ? `You can change it again on ${new Date(s.usernameChangeOpensAt).toLocaleDateString()}.`
                  : "Your public address. You can change it once every 30 days."}
              </p>
            </div>

            <div>
              <label htmlFor="ep-bio" className={label}>
                Bio
              </label>
              <textarea
                id="ep-bio"
                value={bio}
                maxLength={BIO_MAX}
                rows={3}
                onChange={(e) => setBio(e.target.value)}
                placeholder="A line about you"
                className={cn(field, "resize-none py-2.5 leading-relaxed")}
              />
              <p className="text-ar-faint mt-1 text-right text-[11px] tabular-nums">
                {bio.length}/{BIO_MAX}
              </p>
            </div>

            <label className="ar-bevel rounded-ar flex cursor-pointer items-center gap-3 px-3.5 py-3">
              <span className="min-w-0 flex-1">
                <span className="text-ar-text block text-[13.5px] font-semibold">
                  Show my collection
                </span>
                <span className="text-ar-faint block text-[11.5px]">
                  Others can see what you&apos;ve collected.
                </span>
              </span>
              <input
                type="checkbox"
                checked={showCollection}
                onChange={(e) => setShowCollection(e.target.checked)}
                className="h-5 w-5 accent-[hsl(var(--ar-accent))]"
              />
            </label>

            {notice && (
              <p
                role="status"
                className={cn(
                  "rounded-ar border px-3.5 py-2.5 text-[12.5px]",
                  notice.tone === "ok"
                    ? "border-ar-accent/40 bg-ar-accent/10 text-ar-text"
                    : "border-ar-danger/40 bg-ar-danger/10 text-ar-danger",
                )}
              >
                {notice.text}
              </p>
            )}
          </>
        )}
      </div>

      <div className="flex gap-3 px-5 pt-2">
        <ArButton variant="outline" block onClick={onClose}>
          Cancel
        </ArButton>
        <ArButton
          block
          busy={saving}
          disabled={!s || uploading !== null}
          onClick={() => void onSave()}
        >
          Save
        </ArButton>
      </div>
    </BottomSheet>
  );
}
