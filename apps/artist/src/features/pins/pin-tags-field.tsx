"use client";

import { Loader2, Plus, Sparkles, X } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { cn } from "@bandcoin/ui/lib/cn";

import { api } from "~/trpc/react";

import { AiQuota } from "../ai/shared";

export const MAX_TAGS = 10;
const sameTag = (a: string, b: string) =>
  a.trim().toLowerCase().replace(/\s+/g, "-") === b.trim().toLowerCase().replace(/\s+/g, "-");

/** What the AI needs to suggest tags for this pin. */
export type TagBrief = { title: string; description: string; type: string; place: string };

/** Search tags on a pin: type your own, pick ones you used before, or ask the AI. */
export function PinTagsField({
  tags,
  onChange,
  known,
  brief,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  known: string[];
  brief: TagBrief;
}) {
  const [text, setText] = useState("");
  const [suggested, setSuggested] = useState<string[]>([]);
  const suggest = api.ai.suggestPinTags.useMutation({
    onSuccess: (result) => setSuggested(result.tags),
    onError: (error) => toast.error(error.message),
  });

  const has = (tag: string) => tags.some((existing) => sameTag(existing, tag));
  function add(tag: string) {
    const label = tag.trim().replace(/\s+/g, " ");
    if (!label || has(label)) return;
    if (tags.length >= MAX_TAGS) return void toast.error(`Use up to ${MAX_TAGS} tags.`);
    onChange([...tags, label]);
  }
  const remove = (tag: string) => onChange(tags.filter((existing) => existing !== tag));

  const offered = known.filter((tag) => !has(tag));
  const ideas = suggested.filter((tag) => !has(tag));
  const canSuggest = brief.title.trim().length >= 3;

  return (
    <div className="grid gap-4">
      <div className="flex gap-2">
        <Input
          aria-label="New tag"
          value={text}
          maxLength={40}
          placeholder="Add a tag, like street art"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            add(text);
            setText("");
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={!text.trim()}
          onClick={() => {
            add(text);
            setText("");
          }}
        >
          <Plus /> Add
        </Button>
      </div>

      {tags.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Tags on this pin">
          {tags.map((tag) => (
            <li
              key={tag}
              className="bg-primary-soft text-primary-text flex items-center gap-1 rounded-full border border-current/30 py-1 pr-1 pl-3 text-xs font-medium"
            >
              {tag}
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                className="hover:bg-primary/20 rounded-full p-1"
                onClick={() => remove(tag)}
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canSuggest || suggest.isPending}
          onClick={() => suggest.mutate(brief)}
        >
          {suggest.isPending ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Sparkles className="text-primary-text" />
          )}
          Suggest tags
        </Button>
        <AiQuota kind="text" />
        {!canSuggest && <span className="text-fg-faint text-xs">Add a title first.</span>}
      </div>

      <TagChoices label="AI suggestions: tap to add" tags={ideas} dashed onPick={add} />
      <TagChoices label="Tags you have used" tags={offered} onPick={add} />
    </div>
  );
}

function TagChoices({
  label,
  tags,
  dashed,
  onPick,
}: {
  label: string;
  tags: string[];
  dashed?: boolean;
  onPick: (tag: string) => void;
}) {
  if (tags.length === 0) return null;
  return (
    <div className="grid gap-2">
      <p className="text-fg-muted text-xs font-medium">{label}</p>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => onPick(tag)}
            className={cn(
              "hover:bg-surface-2 flex items-center gap-1 rounded-full border px-3 py-1 text-xs",
              dashed && "border-primary/50 border-dashed",
            )}
          >
            <Plus className="size-3" /> {tag}
          </button>
        ))}
      </div>
    </div>
  );
}
