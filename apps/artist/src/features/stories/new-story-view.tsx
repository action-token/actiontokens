"use client";

import { Aperture, BadgeCheck, Eye, ImagePlus, Loader2, Lock, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type DragEvent, type FormEvent, useRef, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@actiontokens/ui/components/button";
import { Input } from "@actiontokens/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@actiontokens/ui/components/select";
import { cn } from "@actiontokens/ui/lib/cn";
import { Field, FormPage, FormSection } from "@actiontokens/ui/patterns/form-page";

import { usePortal } from "~/features/portal/use-portal";
import { api } from "~/trpc/react";

import { useUpload } from "../catalog/use-upload";
import { clipSeconds, MAX_LIVE, storyKindOf, type StoryKind, videoProblem } from "./story-file";

type Audience = "EVERYONE" | "FOLLOWERS" | "SUBSCRIBERS" | "MEMBERS";
type Item = {
  key: string;
  kind: StoryKind;
  preview: string;
  url: string | null;
  caption: string;
};

export const WHO: { value: Audience; label: string; hint: string; icon: typeof Eye }[] = [
  { value: "EVERYONE", label: "Everyone", hint: "Anyone can watch, signed in or not.", icon: Eye },
  {
    value: "FOLLOWERS",
    label: "Followers",
    hint: "Others see a lock and a Follow prompt.",
    icon: Users,
  },
  {
    value: "SUBSCRIBERS",
    label: "Subscribers",
    hint: "Followers who trust your fan token can watch.",
    icon: BadgeCheck,
  },
  {
    value: "MEMBERS",
    label: "Members",
    hint: "Fans holding enough of your fan token can watch.",
    icon: Lock,
  },
];

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

/**
 * A page for adding stories, like New post: drop several photos and clips at
 * once, give each its own caption, pick who can watch, and see each one in a
 * phone-shaped preview before sharing. They all go live in the order shown.
 */
export function NewStoryView() {
  const router = useRouter();
  const utils = api.useUtils();
  const artist = usePortal().artist;
  const live = api.stories.stories.useQuery();
  const tiers = api.memberships.tiers.useQuery();
  const { upload } = useUpload();
  const picker = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [uploading, setUploading] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [audience, setAudience] = useState<Audience>("EVERYONE");
  const [tierId, setTierId] = useState("");
  const [dragging, setDragging] = useState(false);
  const [sharing, setSharing] = useState(false);
  const create = api.stories.createStory.useMutation();

  const activeTiers = tiers.data?.filter((tier) => tier.isActive) ?? [];
  const room = Math.max(0, MAX_LIVE - (live.data?.length ?? 0));
  const queued = items.length + uploading;
  const shown = items.find((item) => item.key === selected) ?? items[0] ?? null;
  const shownIndex = shown ? items.indexOf(shown) : -1;
  const ready = items.length > 0 && uploading === 0 && (audience !== "MEMBERS" || tierId !== "");

  async function add(files: File[]) {
    if (files.length === 0) return;
    const take = files.slice(0, Math.max(0, room - queued));
    if (take.length < files.length)
      toast.error(
        room - queued <= 0
          ? `You can have ${MAX_LIVE} live stories. Remove one first, or share these before adding more.`
          : `Only ${room - queued} more fit (up to ${MAX_LIVE} live at once).`,
      );
    for (const file of take) {
      const kind = storyKindOf(file);
      if (!kind) {
        toast.error(`${file.name} isn't a photo or a video.`);
        continue;
      }
      const preview = URL.createObjectURL(file);
      if (kind === "VIDEO") {
        const problem = videoProblem(await clipSeconds(preview));
        if (problem) {
          URL.revokeObjectURL(preview);
          toast.error(`${file.name}: ${problem}`);
          continue;
        }
      }
      setUploading((count) => count + 1);
      try {
        const url = await upload(file);
        const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setItems((current) => [...current, { key, kind, preview, url, caption: "" }]);
        setSelected((current) => current ?? key);
      } catch (error) {
        URL.revokeObjectURL(preview);
        toast.error(`${file.name} didn't upload: ${messageOf(error)}`);
      } finally {
        setUploading((count) => count - 1);
      }
    }
    if (picker.current) picker.current.value = "";
  }

  const drop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void add([...event.dataTransfer.files]);
  };
  const edit = (key: string, patch: Partial<Item>) =>
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  const remove = (key: string) => {
    setItems((current) => current.filter((item) => item.key !== key));
    setSelected((current) => (current === key ? null : current));
  };

  async function share(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setSharing(true);
    const total = items.length;
    let done = 0;
    for (const item of items) {
      try {
        await create.mutateAsync({
          type: item.kind,
          url: item.url!,
          caption: item.caption.trim() || null,
          audience,
          tierId: audience === "MEMBERS" ? tierId : null,
        });
        done += 1;
        remove(item.key);
      } catch (error) {
        toast.error(`${done} of ${total} shared. ${messageOf(error)}`);
        void utils.stories.invalidate();
        setSharing(false);
        return;
      }
    }
    toast.success(total === 1 ? "Story is live" : `${total} stories are live`);
    void utils.stories.invalidate();
    router.push("/stories");
  }

  const actions = (
    <>
      <Button type="button" variant="ghost" asChild>
        <Link href="/stories">Cancel</Link>
      </Button>
      <Button type="submit" disabled={!ready || sharing}>
        {sharing && <Loader2 className="animate-spin" />}
        {items.length > 1 ? `Share ${items.length} stories` : "Share story"}
      </Button>
    </>
  );

  return (
    <FormPage
      title="New story"
      eyebrow="Content"
      description="Photos and short clips that show as a ring at the top of your fans' feed for 24 hours."
      back={{ href: "/stories", label: "Stories" }}
      onSubmit={(event) => void share(event)}
      actions={actions}
      aside={
        <FormSection
          title="Preview"
          icon={Aperture}
          description="How fans see it. Tap a story on the left to preview it."
        >
          <PhonePreview
            item={shown}
            index={shownIndex}
            count={items.length}
            name={artist?.name ?? "You"}
            audience={audience}
          />
        </FormSection>
      }
    >
      <FormSection
        title="Photos and videos"
        icon={ImagePlus}
        description={
          room === 0
            ? `You have ${MAX_LIVE} live stories. Remove one to add another.`
            : `Add up to ${room} more now. Clips can be up to 30 seconds.`
        }
      >
        <input
          ref={picker}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={(event) => void add([...(event.target.files ?? [])])}
        />
        <div
          role="button"
          tabIndex={0}
          aria-label="Add photos or videos"
          onClick={() => picker.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              picker.current?.click();
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
          className={cn(
            "text-fg-muted flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center text-sm font-medium transition-colors",
            dragging ? "border-primary bg-primary-soft" : "hover:bg-surface-2",
          )}
        >
          {uploading > 0 ? (
            <Loader2 className="size-6 animate-spin" />
          ) : (
            <ImagePlus className="size-6" />
          )}
          {uploading > 0
            ? `Uploading ${uploading}…`
            : "Drop photos and videos here, or click to choose"}
          <span className="text-fg-faint text-xs">
            Pick several at once. Each becomes its own story.
          </span>
        </div>

        {items.length > 0 && (
          <ol className="grid gap-3">
            {items.map((item, index) => (
              <li
                key={item.key}
                className={cn(
                  "flex items-start gap-3 rounded-xl border-2 p-2.5 transition-colors",
                  shown?.key === item.key ? "border-primary" : "bg-surface-2 border-transparent",
                )}
              >
                <button
                  type="button"
                  onClick={() => setSelected(item.key)}
                  aria-label={`Preview story ${index + 1}`}
                  className="bg-surface-3 relative block h-24 w-[3.375rem] shrink-0 overflow-hidden rounded-lg"
                >
                  {item.kind === "VIDEO" ? (
                    <video
                      src={item.preview}
                      muted
                      playsInline
                      preload="metadata"
                      className="size-full object-cover"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- a local preview
                    <img src={item.preview} alt="" className="size-full object-cover" />
                  )}
                  <span className="absolute top-1 left-1 grid size-5 place-items-center rounded-full bg-black/60 text-[10px] font-bold text-white">
                    {index + 1}
                  </span>
                </button>
                <div className="min-w-0 flex-1">
                  <Field label="Caption" htmlFor={`caption-${item.key}`}>
                    <Input
                      id={`caption-${item.key}`}
                      value={item.caption}
                      maxLength={200}
                      onFocus={() => setSelected(item.key)}
                      onChange={(event) => edit(item.key, { caption: event.target.value })}
                      placeholder="Optional"
                    />
                  </Field>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove story ${index + 1}`}
                  onClick={() => remove(item.key)}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ol>
        )}
      </FormSection>

      <FormSection title="Who can watch" icon={Users}>
        <div role="radiogroup" aria-label="Who can watch" className="grid gap-2 sm:grid-cols-3">
          {WHO.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={audience === option.value}
              onClick={() => setAudience(option.value)}
              className={cn(
                "grid content-start gap-1 rounded-xl border-2 p-3 text-left transition-colors",
                audience === option.value ? "border-primary bg-primary-soft" : "hover:bg-surface-2",
              )}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <option.icon className="size-4" /> {option.label}
              </span>
              <span className="text-fg-muted text-xs">{option.hint}</span>
            </button>
          ))}
        </div>
        {audience === "MEMBERS" && (
          <Field
            label="Which tier"
            hint={
              activeTiers.length === 0 && !tiers.isPending
                ? "Create a membership tier first."
                : undefined
            }
          >
            <Select value={tierId} onValueChange={setTierId}>
              <SelectTrigger className="sm:w-64">
                <SelectValue placeholder="Pick a tier" />
              </SelectTrigger>
              <SelectContent>
                {activeTiers.map((tier) => (
                  <SelectItem key={tier.id} value={tier.id}>
                    {tier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      </FormSection>
    </FormPage>
  );
}

/** A phone-shaped preview of one story: the picture, who posted, the caption and a lock note. */
function PhonePreview({
  item,
  index,
  count,
  name,
  audience,
}: {
  item: Item | null;
  index: number;
  count: number;
  name: string;
  audience: Audience;
}) {
  return (
    <div className="bg-fg mx-auto aspect-[9/16] w-full max-w-[260px] overflow-hidden rounded-[2rem] border-4 border-black p-0">
      <div className="relative size-full">
        {item ? (
          item.kind === "VIDEO" ? (
            <video
              key={item.key}
              src={item.preview}
              muted
              loop
              autoPlay
              playsInline
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- a local preview
            <img src={item.preview} alt="" className="absolute inset-0 size-full object-cover" />
          )
        ) : (
          <div className="text-fg-faint absolute inset-0 grid place-items-center bg-neutral-900 p-6 text-center text-xs">
            Add a photo or a clip to see it here.
          </div>
        )}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/75 to-transparent"
        />
        <div className="absolute inset-x-3 top-3 grid gap-2 text-white">
          <div className="flex gap-1" aria-hidden>
            {Array.from({ length: Math.max(1, count) }, (_, position) => (
              <span
                key={position}
                className={cn(
                  "h-0.5 flex-1 rounded-full",
                  position === index ? "bg-white" : "bg-white/40",
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className="grid size-7 place-items-center rounded-full bg-white/25 text-[10px]">
              {name.slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate">{name}</span>
            {audience !== "EVERYONE" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 text-[10px]">
                {audience === "MEMBERS" ? (
                  <Lock className="size-3" />
                ) : (
                  <Users className="size-3" />
                )}
                {audience === "MEMBERS" ? "Members" : "Followers"}
              </span>
            )}
          </div>
        </div>
        {item?.caption.trim() && (
          <p className="absolute inset-x-3 bottom-4 text-center text-sm leading-snug font-medium text-white">
            {item.caption.trim()}
          </p>
        )}
      </div>
    </div>
  );
}
