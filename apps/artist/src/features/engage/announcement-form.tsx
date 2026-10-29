"use client";

import { Loader2, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { Textarea } from "@bandcoin/ui/components/textarea";

import { fromLocalInput, toLocalInput } from "~/lib/datetime";
import { api, type RouterOutputs } from "~/trpc/react";

import { Field, Note } from "../catalog/form-parts";
import { useUpload } from "../catalog/use-upload";

type Existing = RouterOutputs["engage"]["announcements"][number];

const MAX_IMAGES = 4;
const messageOf = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong.");

/** One form for a new announcement and for editing one: the news, up to four images, an optional button and an end date. */
export function AnnouncementForm({ existing }: { existing?: Existing }) {
  const router = useRouter();
  const utils = api.useUtils();
  const { upload, busy: uploading } = useUpload();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [images, setImages] = useState<string[]>(existing?.imageUrls ?? []);
  const [pinned, setPinned] = useState(existing?.isPinned ?? false);
  const [ctaLabel, setCtaLabel] = useState(existing?.ctaLabel ?? "");
  const [ctaUrl, setCtaUrl] = useState(existing?.ctaUrl ?? "");
  const [expires, setExpires] = useState(existing?.expiresAt ? toLocalInput(existing.expiresAt) : "");

  const done = (message: string) => {
    toast.success(message);
    void utils.engage.announcements.invalidate();
    router.push("/announcements");
  };
  const create = api.engage.createAnnouncement.useMutation({ onSuccess: () => done("Announcement posted"), onError: (error) => toast.error(messageOf(error)) });
  const update = api.engage.updateAnnouncement.useMutation({ onSuccess: () => done("Saved"), onError: (error) => toast.error(messageOf(error)) });
  const saving = create.isPending || update.isPending;

  const buttonProblem = Boolean(ctaLabel.trim()) !== Boolean(ctaUrl.trim()) ? "A button needs both a label and a link." : null;
  const ready = title.trim().length > 0 && body.trim().length > 0 && !buttonProblem && !uploading;

  async function addImages(files: FileList | null) {
    if (!files) return;
    try {
      for (const file of Array.from(files).slice(0, MAX_IMAGES - images.length)) {
        const url = await upload(file);
        setImages((current) => [...current, url]);
      }
    } catch (error) {
      toast.error(messageOf(error));
    }
  }

  function submit(submitted: FormEvent) {
    submitted.preventDefault();
    if (!ready) return;
    const fields = { title, body, imageUrls: images, isPinned: pinned, ctaLabel, ctaUrl, expiresAt: fromLocalInput(expires) };
    if (existing) update.mutate({ announcementId: existing.id, ...fields });
    else create.mutate(fields);
  }

  return (
    <form onSubmit={submit} className="bg-surface grid max-w-2xl gap-6 rounded-xl border p-5 sm:p-6">
      <Field label="Title" htmlFor="news-title">
        <Input id="news-title" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Message" htmlFor="news-body">
        <Textarea id="news-body" value={body} rows={6} maxLength={2000} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <Field label={`Images (up to ${MAX_IMAGES})`} htmlFor="news-images">
        <div className="flex flex-wrap gap-2">
          {images.map((url) => (
            <div key={url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="bg-surface-2 size-20 rounded-lg border object-cover" />
              <button
                type="button"
                aria-label="Remove image"
                onClick={() => setImages((current) => current.filter((existingUrl) => existingUrl !== url))}
                className="bg-bg absolute -top-2 -right-2 grid size-6 place-items-center rounded-full border"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          {images.length < MAX_IMAGES && (
            <label className="text-fg-muted hover:bg-surface-2 grid size-20 cursor-pointer place-items-center rounded-lg border border-dashed">
              {uploading ? <Loader2 className="animate-spin" /> : <Plus />}
              <input id="news-images" type="file" accept="image/*" multiple hidden disabled={uploading} onChange={(e) => void addImages(e.target.files)} />
            </label>
          )}
        </div>
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Button label (optional)" htmlFor="news-cta-label" error={buttonProblem}>
          <Input id="news-cta-label" value={ctaLabel} maxLength={30} placeholder="Listen now" onChange={(e) => setCtaLabel(e.target.value)} />
        </Field>
        <Field label="Button link" htmlFor="news-cta-url">
          <Input id="news-cta-url" type="url" placeholder="https://" value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value.trim())} />
        </Field>
      </div>
      <Field label="Hide it after (optional)" htmlFor="news-expires">
        <Input id="news-expires" type="datetime-local" value={expires} className="max-w-60" onChange={(e) => setExpires(e.target.value)} />
        <Note>Leave empty to keep it until you delete it.</Note>
      </Field>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="size-4" />
        Pin to the top of your news
      </label>
      <div className="flex flex-wrap items-center gap-3 border-t pt-5">
        <Button type="submit" disabled={!ready || saving}>
          {saving && <Loader2 className="animate-spin" />}
          {existing ? "Save changes" : "Post"}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/announcements">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
