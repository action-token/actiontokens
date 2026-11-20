"use client";

import {
  CalendarClock,
  ImageIcon,
  Link2,
  Loader2,
  Megaphone,
  Pin,
  Settings,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@actiontokens/ui/components/button";
import { Input } from "@actiontokens/ui/components/input";
import { Textarea } from "@actiontokens/ui/components/textarea";
import {
  Field,
  FormPage,
  FormSection,
  OptionList,
  SwitchRow,
} from "@actiontokens/ui/patterns/form-page";

import { DeleteCard } from "~/components/delete-card";
import { fromLocalInput, toLocalInput } from "~/lib/datetime";
import { api, type RouterOutputs } from "~/trpc/react";

import { AiFillCard } from "../ai/ai-fill-card";
import { AiImagePanel } from "../ai/ai-image-panel";
import { AiTextButton } from "../ai/ai-text-button";
import { FileField } from "../catalog/file-field";

type Existing = RouterOutputs["engage"]["announcements"][number];

const MAX_IMAGES = 4;
const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

function weekFromNow() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setHours(23, 59, 0, 0);
  return toLocalInput(date);
}

/** One form for a new announcement and for editing one: the news, up to four images, an optional button and an end date. */
export function AnnouncementForm({ existing }: { existing?: Existing }) {
  const router = useRouter();
  const utils = api.useUtils();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [images, setImages] = useState<string[]>(existing?.imageUrls ?? []);
  const [uploadKey, setUploadKey] = useState(0);
  const [imageBrief, setImageBrief] = useState("");
  const [pinned, setPinned] = useState(existing?.isPinned ?? false);
  const [withButton, setWithButton] = useState(Boolean(existing?.ctaUrl));
  const [ctaLabel, setCtaLabel] = useState(existing?.ctaLabel ?? "");
  const [ctaUrl, setCtaUrl] = useState(existing?.ctaUrl ?? "");
  const [expires, setExpires] = useState(Boolean(existing?.expiresAt));
  const [expiresAt, setExpiresAt] = useState(
    existing?.expiresAt ? toLocalInput(existing.expiresAt) : weekFromNow(),
  );

  const done = (message: string) => {
    toast.success(message);
    void utils.engage.announcements.invalidate();
    router.push("/events/announcements");
  };
  const create = api.engage.createAnnouncement.useMutation({
    onSuccess: () => done("Announcement posted"),
    onError: (error) => toast.error(messageOf(error)),
  });
  const update = api.engage.updateAnnouncement.useMutation({
    onSuccess: () => done("Saved"),
    onError: (error) => toast.error(messageOf(error)),
  });
  const remove = api.engage.removeAnnouncement.useMutation({
    onSuccess: () => done("Announcement deleted"),
    onError: (error) => toast.error(messageOf(error)),
  });
  const saving = create.isPending || update.isPending;

  const buttonProblem =
    withButton && Boolean(ctaLabel.trim()) !== Boolean(ctaUrl.trim())
      ? "A button needs both a label and a link."
      : null;
  const expiry = expires ? fromLocalInput(expiresAt) : null;
  const expiryProblem =
    expires && (!expiry || expiry <= new Date()) ? "Pick an end date in the future." : null;
  const ready =
    title.trim().length > 0 && body.trim().length > 0 && !buttonProblem && !expiryProblem;

  const aiContext = { title, message: body, button: withButton ? ctaLabel : "" };
  const imagePrompt = imageBrief || [title, body.slice(0, 400)].filter(Boolean).join(". ");
  const addImage = (url: string) => setImages((current) => [...current, url].slice(0, MAX_IMAGES));

  function submit(submitted: FormEvent) {
    submitted.preventDefault();
    if (!ready) return;
    const fields = {
      title,
      body,
      imageUrls: images,
      isPinned: pinned,
      ctaLabel: withButton ? ctaLabel : null,
      ctaUrl: withButton ? ctaUrl : null,
      expiresAt: expiry,
    };
    if (existing) update.mutate({ announcementId: existing.id, ...fields });
    else create.mutate(fields);
  }

  const actions = (
    <>
      <Button asChild type="button" variant="ghost">
        <Link href="/events/announcements">Cancel</Link>
      </Button>
      <Button type="submit" disabled={!ready || saving}>
        {saving && <Loader2 className="animate-spin" />}
        {existing ? "Save changes" : "Post announcement"}
      </Button>
    </>
  );

  return (
    <FormPage
      title={existing ? existing.title : "New announcement"}
      eyebrow="Drops"
      description="Short news fans see in the AR app. Pinned ones stay on top."
      back={{ href: "/events/announcements", label: "Announcements" }}
      onSubmit={submit}
      actions={actions}
      aside={
        <>
          <section className="bg-surface border-fg/10 overflow-hidden rounded-[1.4rem] border-2">
            {images[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={images[0]} alt="" className="aspect-video w-full object-cover" />
            )}
            <div className="grid gap-2 p-5">
              <p className="text-primary-text flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
                Preview {pinned && <Pin className="size-3" />}
              </p>
              <p className="display text-2xl leading-snug">{title || "Untitled announcement"}</p>
              <p className="text-fg-muted line-clamp-6 text-sm whitespace-pre-line">
                {body || "Your message shows here."}
              </p>
              {withButton && ctaUrl.trim() && (
                <Button type="button" size="sm" className="mt-2 w-full" tabIndex={-1}>
                  {ctaLabel || "Learn more"}
                </Button>
              )}
              {expires && expiry && (
                <p className="text-fg-faint pt-1 text-xs">Hidden after {expiry.toLocaleString()}</p>
              )}
            </div>
          </section>
          {existing && (
            <DeleteCard
              title="Delete this announcement"
              confirmTitle="Delete this announcement?"
              description={`Its ${existing.comments} comments go with it. This can't be undone.`}
              busy={remove.isPending}
              onDelete={() => remove.mutate({ announcementId: existing.id })}
            />
          )}
        </>
      }
    >
      {!existing && (
        <AiFillCard
          form="announcement"
          context={aiContext}
          examples={[
            "New single out Friday, pre-save now",
            "Signed vinyl restock this weekend, first 50 get a poster",
            "I'm playing three shows in December",
          ]}
          apply={(result) => {
            const before = { title, body, withButton, ctaLabel, ctaUrl, imageBrief };
            setTitle(result.title);
            setBody(result.body);
            setWithButton(Boolean(result.ctaUrl));
            if (result.ctaLabel) setCtaLabel(result.ctaLabel);
            if (result.ctaUrl) setCtaUrl(result.ctaUrl);
            setImageBrief(result.imagePrompt);
            return () => {
              setTitle(before.title);
              setBody(before.body);
              setWithButton(before.withButton);
              setCtaLabel(before.ctaLabel);
              setCtaUrl(before.ctaUrl);
              setImageBrief(before.imageBrief);
            };
          }}
        />
      )}

      <FormSection title="Message" icon={Megaphone}>
        <Field
          label="Title"
          htmlFor="news-title"
          required
          action={
            <AiTextButton
              form="announcement"
              field="title"
              maxChars={100}
              value={title}
              context={aiContext}
              onChange={setTitle}
            />
          }
        >
          <Input
            id="news-title"
            value={title}
            maxLength={100}
            placeholder="New single out Friday"
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field
          label="Message"
          htmlFor="news-body"
          required
          action={
            <AiTextButton
              form="announcement"
              field="message"
              maxChars={2000}
              value={body}
              context={aiContext}
              onChange={setBody}
            />
          }
        >
          <Textarea
            id="news-body"
            value={body}
            rows={7}
            maxLength={2000}
            placeholder="Tell your fans what's new…"
            onChange={(e) => setBody(e.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection
        title="Images"
        icon={ImageIcon}
        description={`Optional, up to ${MAX_IMAGES}. The first is the cover.`}
      >
        {images.length < MAX_IMAGES && (
          <>
            <FileField
              key={uploadKey}
              id="news-images"
              accept="image/*"
              value={null}
              hint={images.length ? "Add another image" : "Drop an image here, or click to choose"}
              onChange={(file) => {
                if (!file) return;
                addImage(file.url);
                setUploadKey((n) => n + 1);
              }}
            />
            <AiImagePanel
              form="announcement"
              aspect="wide"
              suggestedPrompt={imagePrompt}
              onImage={addImage}
            />
          </>
        )}
        {images.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {images.map((src, index) => (
              <li key={src} className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt=""
                  className="aspect-square w-full rounded-lg border object-cover"
                />
                {index === 0 && (
                  <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white uppercase">
                    Cover
                  </span>
                )}
                <button
                  type="button"
                  aria-label="Remove image"
                  onClick={() =>
                    setImages((current) => current.filter((existingUrl) => existingUrl !== src))
                  }
                  className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </FormSection>

      <FormSection title="Options" icon={Settings}>
        <OptionList>
          <SwitchRow
            icon={Pin}
            title="Pin to top"
            hint="Stays first in your news."
            checked={pinned}
            onChange={setPinned}
          />
          <SwitchRow
            icon={Link2}
            title="Button"
            hint="A call-to-action that opens a link."
            checked={withButton}
            onChange={setWithButton}
          >
            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <Input
                aria-label="Button text"
                placeholder="Listen now"
                maxLength={30}
                value={ctaLabel}
                onChange={(e) => setCtaLabel(e.target.value)}
              />
              <Input
                aria-label="Button link"
                type="url"
                placeholder="https://"
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value.trim())}
              />
            </div>
            {buttonProblem && (
              <p role="alert" className="text-danger mt-2 text-xs">
                {buttonProblem}
              </p>
            )}
          </SwitchRow>
          <SwitchRow
            icon={CalendarClock}
            title="Expires"
            hint="Hidden from fans automatically after this."
            checked={expires}
            onChange={setExpires}
          >
            <Input
              aria-label="Expires at"
              type="datetime-local"
              value={expiresAt}
              min={toLocalInput(new Date())}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="max-w-60"
            />
            {expiryProblem && (
              <p role="alert" className="text-danger mt-2 text-xs">
                {expiryProblem}
              </p>
            )}
          </SwitchRow>
        </OptionList>
      </FormSection>
    </FormPage>
  );
}
