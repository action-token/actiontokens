"use client";

import { Eye, FileText, Loader2, Lock, Music, Paperclip, Users2, Video, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { cn } from "@bandcoin/ui/lib/cn";
import { Field, FormPage, FormSection } from "@bandcoin/ui/patterns/form-page";
import { Markdown } from "@bandcoin/ui/patterns/markdown";
import { MarkdownEditor } from "@bandcoin/ui/patterns/markdown-editor";

import { DeleteCard } from "~/components/delete-card";
import { usePortal } from "~/features/portal/use-portal";
import { api, type RouterOutputs } from "~/trpc/react";

import { AiFillCard } from "../ai/ai-fill-card";
import { AiImagePanel } from "../ai/ai-image-panel";
import { AiTextButton } from "../ai/ai-text-button";

import { MediaDrop, type PostMedia } from "./media-drop";
import { PostSettingsSection } from "./post-settings";
import { settingsFrom, settingsProblem, settingsSummary } from "./post-settings-model";
import { PostComments } from "./post-comments";

type Existing = RouterOutputs["posts"]["post"];
type Media = PostMedia;

const MAX_MEDIA = 10;
const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

/** One form for a new post and for editing one: title, body, media, and who can see it, with a live preview beside it. */
export function PostForm({ existing }: { existing?: Existing }) {
  const router = useRouter();
  const utils = api.useUtils();
  const portal = usePortal();
  const tiers = api.memberships.tiers.useQuery();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [settings, setSettings] = useState(() => settingsFrom(existing));
  const [media, setMedia] = useState<Media[]>(
    existing?.media.map(({ type, url, title }) => ({
      type: type as Media["type"],
      url,
      title,
    })) ?? [],
  );
  const [imageBrief, setImageBrief] = useState("");

  const done = (message: string) => {
    toast.success(message);
    void utils.posts.posts.invalidate();
    void utils.posts.post.invalidate();
    router.push("/posts");
  };
  const create = api.posts.createPost.useMutation({
    onSuccess: () => done("Post published"),
    onError: (error) => toast.error(messageOf(error)),
  });
  const update = api.posts.updatePost.useMutation({
    onSuccess: () => done("Saved"),
    onError: (error) => toast.error(messageOf(error)),
  });
  const remove = api.posts.removePost.useMutation({
    onSuccess: () => done("Post deleted"),
    onError: (error) => toast.error(messageOf(error)),
  });
  const saving = create.isPending || update.isPending;
  const problem = settingsProblem(settings, existing?.collected ?? 0);
  const ready = title.trim().length > 0 && problem === null;
  const tierName = (id: string | null) =>
    tiers.data?.find((tier) => tier.id === id)?.name ?? "Members";
  const summary = settingsSummary(settings, tierName, media.length > 0);
  const aiContext = { title, content: body };
  const imagePrompt = imageBrief || [title, body.slice(0, 400)].filter(Boolean).join(". ");
  const addMedia = (file: Media) => setMedia((current) => [...current, file].slice(0, MAX_MEDIA));

  function submit(submitted: FormEvent) {
    submitted.preventDefault();
    if (!ready) return;
    const fields = { title, body, media, ...settings };
    if (existing) update.mutate({ postId: existing.id, ...fields });
    else create.mutate(fields);
  }

  const actions = (
    <>
      <Button asChild type="button" variant="ghost">
        <Link href="/posts">Cancel</Link>
      </Button>
      {problem && <p className="text-danger mr-auto text-xs">{problem}</p>}
      <Button type="submit" disabled={!ready || saving}>
        {saving && <Loader2 className="animate-spin" />}
        {existing ? "Save changes" : "Publish post"}
      </Button>
    </>
  );

  return (
    <FormPage
      title={existing ? existing.title : "New post"}
      eyebrow="Content"
      description="Share news, media and perks with your fans. You choose who can see, comment on and collect it."
      back={{ href: "/posts", label: "Posts" }}
      onSubmit={submit}
      actions={actions}
      aside={
        <>
          <section className="bg-surface rounded-[1.4rem] border-2 p-5">
            <h2 className="display mb-4 flex items-center gap-2 text-base">
              <Eye className="text-primary-text size-4" /> Preview
            </h2>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{portal.artist?.name ?? "You"}</p>
              <p className="text-fg-muted flex items-center gap-1 text-xs">
                {settings.audience === "EVERYONE" ? (
                  <Users2 className="size-3" />
                ) : (
                  <Lock className="size-3" />
                )}
                {summary.see}
              </p>
            </div>
            <p className="display mt-4 text-lg leading-snug">
              {title || <span className="text-fg-faint">Your title</span>}
            </p>
            {body.trim() ? (
              <Markdown content={body} compact className="mt-2 line-clamp-6" />
            ) : (
              <p className="text-fg-faint mt-2 text-sm">What you write shows up here.</p>
            )}
            {media.length > 0 && (
              <div className={cn("mt-4 grid gap-2", media.length > 1 && "grid-cols-2")}>
                {media.slice(0, 4).map((file) => (
                  <MediaThumb key={file.url} media={file} />
                ))}
              </div>
            )}
            <dl className="text-fg-muted mt-4 grid gap-1 border-t pt-3 text-xs">
              <div className="flex justify-between gap-3">
                <dt>Comments</dt>
                <dd className="text-fg text-right font-medium capitalize">{summary.comment}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Collect</dt>
                <dd className="text-fg text-right font-medium">{summary.collect}</dd>
              </div>
            </dl>
          </section>
          {existing && (
            <>
              <PostComments postId={existing.id} />
              <DeleteCard
                title="Delete this post"
                confirmTitle="Delete this post?"
                description={
                  existing.collected > 0
                    ? `${existing.collected} fans collected a copy, so it can't be deleted.`
                    : `Its ${existing.comments} comments and ${existing.likes} likes go with it. This can't be undone.`
                }
                busy={remove.isPending}
                onDelete={() => remove.mutate({ postId: existing.id })}
              />
            </>
          )}
        </>
      }
    >
      {!existing && (
        <AiFillCard
          form="post"
          context={aiContext}
          examples={[
            "Announce our summer merch drop this Friday",
            "Thank fans for 10k followers with a members-only perk",
            "Behind the scenes of recording the new album",
          ]}
          apply={(result) => {
            const before = { title, body, imageBrief };
            setTitle(result.title);
            setBody(result.body);
            setImageBrief(result.imagePrompt);
            return () => {
              setTitle(before.title);
              setBody(before.body);
              setImageBrief(before.imageBrief);
            };
          }}
        />
      )}

      <FormSection title="Post" icon={FileText}>
        <Field
          label="Title"
          htmlFor="post-title"
          required
          action={
            <AiTextButton
              form="post"
              field="title"
              maxChars={120}
              value={title}
              context={aiContext}
              onChange={setTitle}
            />
          }
        >
          <Input
            id="post-title"
            value={title}
            maxLength={120}
            placeholder="Add a compelling title"
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Field
          label="Content"
          action={
            <AiTextButton
              form="post"
              field="post body"
              value={body}
              context={aiContext}
              onChange={setBody}
            />
          }
        >
          <MarkdownEditor
            value={body}
            onChange={setBody}
            placeholder="Write something for your fans…"
            minHeight={220}
          />
        </Field>
      </FormSection>

      <FormSection
        title="Media"
        icon={Paperclip}
        description={`Optional: up to ${MAX_MEDIA} images, videos and songs, in any mix.`}
      >
        {media.length < MAX_MEDIA && (
          <>
            <MediaDrop room={MAX_MEDIA - media.length} onAdd={addMedia} />
            <AiImagePanel
              form="post"
              aspect="wide"
              suggestedPrompt={imagePrompt}
              onImage={(url) => addMedia({ type: "IMAGE", url })}
            />
          </>
        )}
        {media.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {media.map((file) => (
              <li key={file.url} className="group relative">
                <MediaThumb media={file} />
                <button
                  type="button"
                  aria-label="Remove file"
                  onClick={() =>
                    setMedia((current) => current.filter((entry) => entry.url !== file.url))
                  }
                  className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </FormSection>

      <PostSettingsSection
        value={settings}
        onChange={setSettings}
        tiers={tiers.data ?? []}
        loadingTiers={tiers.isPending}
        collected={existing?.collected ?? 0}
        hasMedia={media.length > 0}
      />
    </FormPage>
  );
}

function MediaThumb({ media }: { media: Media }) {
  const frame = "bg-surface-2 aspect-square w-full rounded-lg border";
  if (media.type === "IMAGE")
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={media.url} alt="" className={cn(frame, "object-cover")} />;
  if (media.type === "VIDEO")
    return (
      <div className={cn(frame, "relative overflow-hidden bg-black")}>
        <video src={media.url} muted preload="metadata" className="size-full object-cover" />
        <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">
          <Video className="size-3" /> Video
        </span>
      </div>
    );
  return (
    <div className={cn(frame, "flex flex-col items-center justify-center gap-1.5 p-2 text-center")}>
      <Music className="text-fg-muted size-6" />
      <span className="text-fg-muted line-clamp-2 text-xs break-all">{media.title ?? "Song"}</span>
    </div>
  );
}
