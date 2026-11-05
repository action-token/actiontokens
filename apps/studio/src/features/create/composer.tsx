"use client";

import {
  ArrowUp,
  Check,
  ChevronDown,
  Coins,
  Loader2,
  SlidersHorizontal,
  Wand2,
} from "lucide-react";
import { useDeferredValue, useRef, type ReactNode } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@bandcoin/ui/components/popover";
import { Switch } from "@bandcoin/ui/components/switch";
import { cn } from "@bandcoin/ui/lib/cn";

import { api, type RouterInputs, type RouterOutputs } from "~/trpc/react";

import type { ToolId } from "../shell/nav";

export type StartInput = RouterInputs["generate"]["start"];
export type Model = RouterOutputs["coins"]["prices"]["models"][number];

/** Everything the chips set; each tool reads the parts it has. */
export type Settings = {
  model?: string;
  aspectRatio?: string;
  size?: string;
  quality?: string;
  count?: number;
  style?: string;
  resolution?: string;
  platform?: string;
  postLength?: string;
  numberOfVariations?: number;
  postStyle?: string;
  includeHashtags?: boolean;
  includeEmojis?: boolean;
  context?: string;
  wordCount?: number;
  tone?: string;
  primaryKeyword?: string;
  includeFAQ?: boolean;
  includeTableOfContents?: boolean;
};

const MODEL_TOOL = {
  IMAGE: "IMAGE",
  VIDEO: "VIDEO",
  TEXT: "TEXT",
  SOCIAL: "TEXT",
  SEO: "TEXT",
} as const;
const STYLES = ["Photo", "Cinematic", "Anime", "3D render", "Watercolor", "Poster", "Sketch"];
const PLATFORMS = ["Instagram", "Facebook", "X", "LinkedIn", "TikTok", "Threads"] as const;
const LENGTHS = ["short", "medium", "long", "thread"] as const;
const TONES = ["friendly", "professional", "bold", "playful"];
const WORDS = [400, 800, 1500, 2500];

/** The run the server gets: the prompt (or topic) plus only the settings that tool takes. */
export function buildInput(tool: ToolId, prompt: string, s: Settings): StartInput {
  const text = prompt.trim();
  switch (tool) {
    case "IMAGE":
      return {
        tool,
        prompt: text,
        model: s.model,
        aspectRatio: s.aspectRatio as "1:1" | undefined,
        size: s.size as "1K" | undefined,
        quality: s.quality as "low" | undefined,
        count: s.count,
        style: s.style,
      };
    case "VIDEO":
      return {
        tool,
        prompt: text,
        model: s.model,
        aspectRatio: s.aspectRatio as "16:9" | undefined,
        resolution: s.resolution as "720p" | undefined,
      };
    case "TEXT":
      return { tool, prompt: text, model: s.model };
    case "SOCIAL":
      return {
        tool,
        topic: text,
        model: s.model,
        platform: s.platform as "Instagram" | undefined,
        postLength: s.postLength as "medium" | undefined,
        numberOfVariations: s.numberOfVariations,
        postStyle: s.postStyle,
        includeHashtags: s.includeHashtags,
        includeEmojis: s.includeEmojis,
        context: s.context,
      };
    case "SEO":
      return {
        tool,
        topic: text,
        model: s.model,
        wordCount: s.wordCount,
        tone: s.tone,
        primaryKeyword: s.primaryKeyword,
        includeFAQ: s.includeFAQ,
        includeTableOfContents: s.includeTableOfContents,
      };
  }
}

/** The models a tool can use, and the chosen one (the tool's default until you pick). */
export function useModels(tool: ToolId, chosen?: string) {
  const prices = api.coins.prices.useQuery(undefined, { staleTime: 60_000 });
  const models = (prices.data?.models ?? []).filter((model) => model.tool === MODEL_TOOL[tool]);
  const model =
    models.find((entry) => entry.id === chosen) ?? models.find((entry) => entry.isDefault);
  return { models, model };
}

/**
 * The prompt box, as in Gemini or ChatGPT: what to make, then in one row the
 * model menu, the settings that model supports as chips, Enhance, and the
 * Generate button with the server's price for exactly these settings.
 */
export function Composer({
  tool,
  prompt,
  onPrompt,
  settings,
  onSettings,
  onSubmit,
  busy,
  placeholder,
  above,
  autoFocus,
}: {
  tool: ToolId;
  prompt: string;
  onPrompt: (prompt: string) => void;
  settings: Settings;
  onSettings: (settings: Settings) => void;
  onSubmit: () => void;
  busy: boolean;
  placeholder: string;
  /** Shown over the box (the home page's tool chips) */
  above?: ReactNode;
  autoFocus?: boolean;
}) {
  const { models, model } = useModels(tool, settings.model);
  const enhance = api.generate.enhance.useMutation();
  const box = useRef<HTMLTextAreaElement>(null);
  const set = (patch: Settings) => onSettings({ ...settings, ...patch });

  // Priced with a stand-in prompt, so the button shows the price before you type.
  const priced = useDeferredValue(buildInput(tool, "price check", settings));
  const price = api.generate.price.useQuery(priced, {
    enabled: Boolean(model),
    placeholderData: (previous) => previous,
    retry: false,
  });
  const ready = prompt.trim().length >= 3 && !busy && Boolean(model) && !price.isError;

  function pickModel(next: Model) {
    // Keep a setting only if the new model has it too.
    onSettings({
      ...settings,
      model: next.id,
      aspectRatio: next.ratios?.includes(settings.aspectRatio ?? "")
        ? settings.aspectRatio
        : undefined,
      size: next.sizes?.some((size) => size.id === settings.size) ? settings.size : undefined,
      quality: next.qualities?.some((quality) => quality.id === settings.quality)
        ? settings.quality
        : undefined,
      count: Math.min(settings.count ?? 1, next.maxCount ?? 1),
      resolution: next.resolutions?.some((entry) => entry.id === settings.resolution)
        ? settings.resolution
        : undefined,
    });
  }

  return (
    <div className="grid gap-2">
      {above}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) onSubmit();
        }}
        className="bg-surface focus-within:border-fg/40 grid gap-2 rounded-[1.6rem] border-2 p-3 shadow-[0_10px_40px_-20px_rgb(0_0_0/0.5)] transition-colors"
      >
        <textarea
          ref={box}
          value={prompt}
          autoFocus={autoFocus}
          rows={2}
          maxLength={2000}
          onChange={(event) => onPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (ready) onSubmit();
            }
          }}
          placeholder={placeholder}
          aria-label="Prompt"
          className="placeholder:text-fg-faint [field-sizing:content] max-h-60 min-h-14 w-full resize-none bg-transparent px-2 pt-1 text-[15px] outline-none"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <ModelMenu models={models} model={model} onPick={pickModel} />
          {model && <Chips tool={tool} model={model} settings={settings} set={set} />}
          <button
            type="button"
            title="Enhance: rewrite your prompt with more detail (free)"
            disabled={prompt.trim().length < 3 || enhance.isPending}
            onClick={() =>
              enhance.mutate(
                { tool: tool === "SOCIAL" || tool === "SEO" ? "TEXT" : tool, prompt },
                {
                  onSuccess: (result) => {
                    onPrompt(result.prompt);
                    box.current?.focus();
                  },
                },
              )
            }
            className="text-fg-muted hover:text-fg hover:bg-surface-2 flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold transition-colors disabled:opacity-40"
          >
            {enhance.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Wand2 className="size-3.5" />
            )}
            Enhance
          </button>
          <span className="flex-1" />
          <button
            type="submit"
            disabled={!ready}
            className="bg-primary text-primary-foreground flex h-10 items-center gap-2 rounded-full pr-1.5 pl-4 text-sm font-bold transition-transform hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100"
          >
            {busy ? "Starting…" : "Generate"}
            <span className="bg-primary-foreground text-primary flex h-7 items-center gap-1 rounded-full px-2 text-xs tabular-nums">
              <Coins className="size-3.5" />
              {price.data ? price.data.coins : "…"}
              <ArrowUp className="size-3.5" strokeWidth={3} />
            </span>
          </button>
        </div>
        {(enhance.error ?? price.error) && (
          <p role="alert" className="text-danger px-2 text-xs">
            {(enhance.error ?? price.error)!.message}
          </p>
        )}
      </form>
    </div>
  );
}

const PROVIDER = { google: "Google", openai: "OpenAI" } as const;

function ModelMenu({
  models,
  model,
  onPick,
}: {
  models: Model[];
  model: Model | undefined;
  onPick: (model: Model) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        className="bg-fg text-bg flex h-8 items-center gap-1.5 rounded-full pr-2 pl-3 text-[13px] font-bold"
        aria-label="Choose a model"
      >
        {model?.name ?? "Model"} <ChevronDown className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-1.5">
        {(["google", "openai"] as const).map((provider) => {
          const list = models.filter((entry) => entry.provider === provider);
          if (list.length === 0) return null;
          return (
            <div key={provider} className="grid gap-0.5 py-1">
              <p className="marker text-fg-muted px-2 text-sm">
                *{PROVIDER[provider].toLowerCase()}*
              </p>
              {list.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onPick(entry)}
                  className={cn(
                    "hover:bg-surface-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-xl px-2.5 py-2 text-left",
                    entry.id === model?.id && "bg-surface-2",
                  )}
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                      {entry.name}
                      {entry.id === model?.id && <Check className="text-primary-text size-3.5" />}
                    </span>
                    <span className="text-fg-muted block truncate text-xs">{entry.blurb}</span>
                  </span>
                  <span className="text-fg-faint flex items-center gap-1 text-xs font-semibold tabular-nums">
                    <Coins className="size-3" /> {entry.coins}
                  </span>
                </button>
              ))}
            </div>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

/** A small "label: value ▾" chip that opens its choices. */
function Chip<T extends string | number>({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onPick: (id: T) => void;
}) {
  const shown = options.find((option) => option.id === value)?.label ?? String(value);
  return (
    <Popover>
      <PopoverTrigger className="bg-surface-2 hover:bg-surface-3 flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-semibold transition-colors">
        <span className="text-fg-muted font-medium">{label}</span> {shown}
        <ChevronDown className="text-fg-faint size-3" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-44 p-1">
        {options.map((option) => (
          <button
            key={String(option.id)}
            type="button"
            onClick={() => onPick(option.id)}
            className={cn(
              "hover:bg-surface-2 flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm",
              option.id === value && "font-semibold",
            )}
          >
            {option.label}
            {option.id === value && <Check className="text-primary-text size-3.5" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

const plain = (values: readonly string[]) => values.map((value) => ({ id: value, label: value }));

/** Only the settings this model has. */
function Chips({
  tool,
  model,
  settings: s,
  set,
}: {
  tool: ToolId;
  model: Model;
  settings: Settings;
  set: (patch: Settings) => void;
}) {
  if (tool === "IMAGE" || tool === "VIDEO") {
    const ratio = s.aspectRatio ?? (tool === "IMAGE" ? "1:1" : "16:9");
    return (
      <>
        <Chip
          label="Ratio"
          value={model.ratios?.includes(ratio) ? ratio : (model.ratios?.[0] ?? ratio)}
          options={plain(model.ratios ?? [])}
          onPick={(aspectRatio) => set({ aspectRatio })}
        />
        {model.sizes && (
          <Chip
            label="Size"
            value={s.size ?? model.sizes[0]!.id}
            options={model.sizes.map((size) => ({ id: size.id, label: size.label }))}
            onPick={(size) => set({ size })}
          />
        )}
        {model.qualities && (
          <Chip
            label="Quality"
            value={s.quality ?? "medium"}
            options={model.qualities.map((quality) => ({ id: quality.id, label: quality.label }))}
            onPick={(quality) => set({ quality })}
          />
        )}
        {model.resolutions && (
          <Chip
            label="Quality"
            value={s.resolution ?? model.resolutions[0]!.id}
            options={model.resolutions.map((entry) => ({ id: entry.id, label: entry.label }))}
            onPick={(resolution) => set({ resolution })}
          />
        )}
        {tool === "IMAGE" && (model.maxCount ?? 1) > 1 && (
          <Chip
            label="Images"
            value={s.count ?? 1}
            options={Array.from({ length: model.maxCount! }, (_, index) => ({
              id: index + 1,
              label: String(index + 1),
            }))}
            onPick={(count) => set({ count })}
          />
        )}
        {tool === "IMAGE" && (
          <Chip
            label="Style"
            value={s.style ?? ""}
            options={[{ id: "", label: "None" }, ...plain(STYLES)]}
            onPick={(style) => set({ style })}
          />
        )}
      </>
    );
  }
  if (tool === "SOCIAL")
    return (
      <>
        <Chip
          label="For"
          value={s.platform ?? "Instagram"}
          options={plain(PLATFORMS)}
          onPick={(platform) => set({ platform })}
        />
        <Chip
          label="Length"
          value={s.postLength ?? "medium"}
          options={plain(LENGTHS)}
          onPick={(postLength) => set({ postLength })}
        />
        <Chip
          label="Versions"
          value={s.numberOfVariations ?? 3}
          options={[1, 2, 3, 4, 5].map((count) => ({ id: count, label: String(count) }))}
          onPick={(numberOfVariations) => set({ numberOfVariations })}
        />
        <More>
          <Choices
            label="Tone"
            value={s.postStyle ?? "friendly"}
            options={TONES}
            onPick={(postStyle) => set({ postStyle })}
          />
          <Toggle
            label="Hashtags"
            on={s.includeHashtags ?? true}
            onChange={(includeHashtags) => set({ includeHashtags })}
          />
          <Toggle
            label="Emojis"
            on={s.includeEmojis ?? true}
            onChange={(includeEmojis) => set({ includeEmojis })}
          />
          <label className="grid gap-1 text-xs font-semibold">
            Anything to mention
            <textarea
              value={s.context ?? ""}
              maxLength={1000}
              rows={3}
              onChange={(event) => set({ context: event.target.value })}
              className="bg-surface-2 rounded-lg p-2 text-sm font-normal outline-none"
              placeholder="Release date, a link, the venue…"
            />
          </label>
        </More>
      </>
    );
  if (tool === "SEO")
    return (
      <>
        <Chip
          label="Words"
          value={s.wordCount ?? 800}
          options={WORDS.map((count) => ({ id: count, label: count.toLocaleString("en-US") }))}
          onPick={(wordCount) => set({ wordCount })}
        />
        <Chip
          label="Tone"
          value={s.tone ?? "professional"}
          options={plain(TONES)}
          onPick={(tone) => set({ tone })}
        />
        <More>
          <label className="grid gap-1 text-xs font-semibold">
            Main keyword
            <input
              value={s.primaryKeyword ?? ""}
              maxLength={100}
              onChange={(event) => set({ primaryKeyword: event.target.value })}
              className="bg-surface-2 h-9 rounded-lg px-2 text-sm font-normal outline-none"
              placeholder="e.g. indie folk album"
            />
          </label>
          <Toggle
            label="FAQ section"
            on={s.includeFAQ ?? false}
            onChange={(includeFAQ) => set({ includeFAQ })}
          />
          <Toggle
            label="Table of contents"
            on={s.includeTableOfContents ?? false}
            onChange={(includeTableOfContents) => set({ includeTableOfContents })}
          />
        </More>
      </>
    );
  return null;
}

function More({ children }: { children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger className="bg-surface-2 hover:bg-surface-3 flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-semibold transition-colors">
        <SlidersHorizontal className="size-3.5" /> More
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-72 gap-3 p-3">
        {children}
      </PopoverContent>
    </Popover>
  );
}

function Choices({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: string;
  options: string[];
  onPick: (value: string) => void;
}) {
  return (
    <div className="grid gap-1 text-xs font-semibold">
      {label}
      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onPick(option)}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
              option === value ? "bg-fg text-bg" : "bg-surface-2 text-fg-muted",
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between text-xs font-semibold">
      {label}
      <Switch checked={on} onCheckedChange={onChange} />
    </label>
  );
}
