"use client";

import {
  ArrowLeft,
  Crosshair,
  Laptop,
  Loader2,
  Monitor,
  PanelLeft,
  Smartphone,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

import {
  ALL_PIN_TYPES,
  DEFAULT_DRAFT,
  PIN_TYPE_LABEL,
  arOrigin,
  previewUrl,
  type EmbedDraft,
} from "@actiontokens/ar-core/embed/snippets";
import { Button } from "@actiontokens/ui/components/button";
import { Input } from "@actiontokens/ui/components/input";
import { Label } from "@actiontokens/ui/components/label";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { Switch } from "@actiontokens/ui/components/switch";
import { Textarea } from "@actiontokens/ui/components/textarea";
import { cn } from "@actiontokens/ui/lib/cn";
import { ErrorState } from "@actiontokens/ui/patterns/error-state";

import { api, type RouterOutputs } from "~/trpc/react";

import { Section, Segmented, Toggle } from "./embed-fields";
import { EmbedInstall } from "./embed-install";
import { EmbedStats } from "./embed-stats";

type Tab = "settings" | "install" | "stats";
type View = { lat: number; lng: number; zoom: number };
type Saved = RouterOutputs["embeds"]["embed"];

const ACCENTS = ["#4dff2a", "#39ff88", "#7d2a3c", "#1d4ed8", "#ea580c", "#7c3aed", "#0f172a"];
const WIDTHS = [
  { id: "hero", label: "Hero", icon: Monitor, width: "100%" },
  { id: "sidebar", label: "Sidebar", icon: PanelLeft, width: "420px" },
  { id: "phone", label: "Phone", icon: Smartphone, width: "375px" },
] as const;
const TAB_LABEL: Record<Tab, string> = {
  settings: "Settings",
  install: "Add to website",
  stats: "Stats",
};

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

const draftOf = ({
  id: _id,
  organizationId: _artist,
  createdAt: _created,
  updatedAt: _updated,
  ...draft
}: Saved): EmbedDraft => draft;

/**
 * Edit one website map (`id` = "new" to create). The right side is the real
 * embed in preview mode: settings are pushed into it by postMessage so it
 * updates in place, and it reports where you've panned so "Set start view here"
 * can save exactly the view you see.
 */
export function EmbedEditor({ id }: { id: string }) {
  const isNew = id === "new";
  const saved = api.embeds.embed.useQuery(
    { embedId: id },
    { enabled: !isNew, refetchOnWindowFocus: false },
  );
  if (!isNew && saved.isError)
    return (
      <ErrorState
        message={
          saved.error.data?.code === "NOT_FOUND"
            ? "This map doesn't exist."
            : "Couldn't load this map."
        }
        onRetry={() => void saved.refetch()}
      />
    );
  if (!isNew && !saved.data) return <Skeleton className="m-6 h-96 rounded-xl" />;
  return <Editor id={id} saved={saved.data ?? null} />;
}

function Editor({ id, saved }: { id: string; saved: Saved | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const utils = api.useUtils();
  const isNew = saved === null;
  const tabParam = search.get("tab");
  const tab: Tab =
    !isNew && (tabParam === "install" || tabParam === "stats") ? tabParam : "settings";

  const status = api.portal.status.useQuery();
  const organizationId =
    saved?.organizationId ?? (status.data?.signedIn ? (status.data.artist?.id ?? null) : null);
  const [draft, setDraft] = useState<EmbedDraft>(saved ? draftOf(saved) : DEFAULT_DRAFT);
  const [dirty, setDirty] = useState(false);

  const set = useCallback(<K extends keyof EmbedDraft>(key: K, value: EmbedDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }, []);

  const goTo = (next: Tab) => {
    const params = new URLSearchParams(search.toString());
    if (next === "settings") params.delete("tab");
    else params.set("tab", next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const create = api.embeds.createEmbed.useMutation({
    onSuccess: (result) => {
      toast.success("Map created. Copy the snippet to add it to your site.");
      setDirty(false);
      void utils.embeds.embeds.invalidate();
      router.replace(`/embeds/${result.embedId}?tab=install`);
    },
    onError: (error) => toast.error(messageOf(error)),
  });
  const update = api.embeds.updateEmbed.useMutation({
    onSuccess: () => {
      toast.success("Saved. The live map is updated.");
      setDirty(false);
      void utils.embeds.embeds.invalidate();
      void utils.embeds.embed.invalidate({ embedId: id });
    },
    onError: (error) => toast.error(messageOf(error)),
  });
  const saving = create.isPending || update.isPending;
  const save = () => (isNew ? create.mutate(draft) : update.mutate({ embedId: id, data: draft }));

  return (
    <div className="flex w-full flex-col lg:-mb-12 lg:h-dvh lg:overflow-hidden">
      <div className="bg-background sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b px-4 py-3 md:px-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/embeds" aria-label="Back to website maps">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="display truncate text-2xl">{isNew ? "New website map" : draft.name}</h1>
          <p className="text-fg-muted text-xs">
            {dirty ? "Unsaved changes" : isNew ? "Not saved yet" : "All changes saved"}
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Map sections"
          className="bg-surface-2 order-last flex w-full gap-1 rounded-lg border p-1 sm:order-none sm:w-auto"
        >
          {(Object.keys(TAB_LABEL) as Tab[]).map((entry) => (
            <button
              key={entry}
              type="button"
              role="tab"
              aria-selected={tab === entry}
              disabled={isNew && entry !== "settings"}
              onClick={() => goTo(entry)}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-sm transition disabled:opacity-40 sm:flex-none",
                tab === entry
                  ? "bg-primary text-primary-foreground font-medium shadow-sm"
                  : "text-fg-muted hover:text-foreground",
              )}
            >
              {TAB_LABEL[entry]}
            </button>
          ))}
        </div>
        <Button onClick={save} disabled={saving || (!dirty && !isNew)}>
          {saving && <Loader2 className="animate-spin" />}
          {isNew ? "Create map" : "Save"}
        </Button>
      </div>

      {tab === "install" && !isNew ? (
        <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          <EmbedInstall id={id} draft={draft} />
        </div>
      ) : tab === "stats" && !isNew ? (
        <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          <EmbedStats id={id} />
        </div>
      ) : (
        <div className="grid lg:min-h-0 lg:flex-1 lg:grid-cols-[400px_1fr]">
          <div className="border-b lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-b-0">
            <Settings draft={draft} set={set} />
          </div>
          <Preview
            draft={draft}
            organizationId={organizationId}
            onStartView={(view) => {
              set("centerLat", view.lat);
              set("centerLng", view.lng);
              set("zoom", view.zoom);
            }}
          />
        </div>
      )}
    </div>
  );
}

type SetDraft = <K extends keyof EmbedDraft>(key: K, value: EmbedDraft[K]) => void;

function Settings({ draft, set }: { draft: EmbedDraft; set: SetDraft }) {
  const [domainsText, setDomainsText] = useState(draft.allowedDomains.join("\n"));
  return (
    <div className="grid gap-6 p-4 md:p-6">
      <Section title="Basics">
        <div className="grid gap-1.5">
          <Label htmlFor="em-name">Name</Label>
          <Input
            id="em-name"
            value={draft.name}
            maxLength={80}
            onChange={(event) => set("name", event.target.value)}
          />
          <p className="text-fg-muted text-xs">Only you see this.</p>
        </div>
        <Toggle
          title="Map is live"
          hint="Turn off to show 'Map unavailable' on websites"
          checked={draft.isEnabled}
          onChange={(value) => set("isEnabled", value)}
        />
      </Section>

      <Section title="Where the map opens">
        <p className="text-fg-muted text-sm">
          Pan and zoom the preview to the area you want, then press <b>Set start view here</b> above
          it.
        </p>
        <p className="bg-surface-2 num rounded-lg px-3 py-2 font-mono text-xs">
          {draft.centerLat.toFixed(4)}, {draft.centerLng.toFixed(4)} · zoom {draft.zoom.toFixed(1)}
        </p>
        <Toggle
          title="“Near me” button"
          hint="Visitors can tap it to centre on their location. The browser asks for permission only when they tap."
          checked={draft.showUserLocation}
          onChange={(value) => set("showUserLocation", value)}
        />
      </Section>

      <Section title="Look">
        <div className="grid gap-1.5">
          <Label>Theme</Label>
          <Segmented
            value={draft.theme}
            onChange={(value) => set("theme", value)}
            options={[
              { id: "AUTO", label: "Auto" },
              { id: "LIGHT", label: "Light" },
              { id: "DARK", label: "Dark" },
            ]}
          />
          <p className="text-fg-muted text-xs">Auto follows each visitor&apos;s device setting.</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="em-accent">Accent colour</Label>
          <div className="flex flex-wrap items-center gap-2">
            {ACCENTS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => set("accentColor", color)}
                aria-label={`Accent ${color}`}
                className={cn(
                  "size-7 rounded-full border-2",
                  draft.accentColor.toLowerCase() === color
                    ? "border-foreground"
                    : "border-transparent",
                )}
                style={{ background: color }}
              />
            ))}
            <input
              id="em-accent"
              type="color"
              value={draft.accentColor}
              onChange={(event) => set("accentColor", event.target.value)}
              className="h-8 w-10 cursor-pointer rounded border bg-transparent"
            />
          </div>
          <p className="text-fg-muted text-xs">
            Buttons and clusters. Use your website&apos;s colour.
          </p>
        </div>
      </Section>

      <Section title="Which pins">
        <div className="grid gap-1.5">
          <Label>Show pins from</Label>
          <Segmented
            value={draft.pinSource}
            onChange={(value) => set("pinSource", value)}
            options={[
              { id: "ARTIST", label: "Only my pins" },
              { id: "ALL", label: "All artists" },
            ]}
          />
          <p className="text-fg-muted text-xs">
            {draft.pinSource === "ARTIST"
              ? "Only your own pins appear: on the map, in the list and in search."
              : "Every artist's pins in the area appear, like the Bandcoin AR app."}
          </p>
        </div>
        <Label className="block pt-1">Pin types</Label>
        <div className="flex flex-wrap gap-1.5">
          {ALL_PIN_TYPES.map((type) => {
            const on = draft.pinTypes.includes(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() =>
                  set(
                    "pinTypes",
                    on
                      ? draft.pinTypes.filter((entry) => entry !== type)
                      : [...draft.pinTypes, type],
                  )
                }
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium",
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-fg-muted hover:text-foreground",
                )}
              >
                {PIN_TYPE_LABEL[type]}
              </button>
            );
          })}
        </div>
        <p className="text-fg-muted text-xs">
          {draft.pinTypes.length
            ? "Only the selected types show."
            : "Nothing selected = every type shows."}
        </p>
        <Toggle
          title="Filter chips"
          hint="Let visitors narrow the map by type"
          checked={draft.showFilterChips}
          onChange={(value) => set("showFilterChips", value)}
        />
      </Section>

      <Section title="Features">
        <Toggle
          title="Search box"
          hint="Search pins and places"
          checked={draft.showSearch}
          onChange={(value) => set("showSearch", value)}
        />
        <Toggle
          title="Nearby list"
          hint="A list of pins beside the map on wide screens, a strip on phones"
          checked={draft.showNearby}
          onChange={(value) => set("showNearby", value)}
        />
        <Toggle
          title="Murals"
          hint="Street art Bandcoin fans found and admins verified, shown once visitors zoom in"
          checked={draft.showMurals}
          onChange={(value) => set("showMurals", value)}
        />
        <div className="grid gap-1.5">
          <Label>Scrolling</Label>
          <Segmented
            value={draft.gestureMode}
            onChange={(value) => set("gestureMode", value)}
            options={[
              { id: "COOPERATIVE", label: "Page scrolls (recommended)" },
              { id: "GREEDY", label: "Map grabs scroll" },
            ]}
          />
          <p className="text-fg-muted text-xs">
            {draft.gestureMode === "COOPERATIVE"
              ? "Visitors scroll past the map normally; they zoom with Ctrl/⌘ + scroll or two fingers. Best for a homepage hero."
              : "Every scroll and drag moves the map. Fine for a full-page map, but visitors can get stuck in it."}
          </p>
        </div>
      </Section>

      <Section title="Buttons on the map">
        <LinkField
          title="Events button"
          label={draft.eventsLabel}
          url={draft.eventsUrl}
          defaultUrl={`${arOrigin()}/events`}
          onLabel={(value) => set("eventsLabel", value)}
          onUrl={(value) => set("eventsUrl", value)}
        />
        <LinkField
          title="Bounties button"
          label={draft.bountiesLabel}
          url={draft.bountiesUrl}
          defaultUrl={`${arOrigin()}/bounty`}
          onLabel={(value) => set("bountiesLabel", value)}
          onUrl={(value) => set("bountiesUrl", value)}
        />
      </Section>

      <Section title="Websites allowed to show this map">
        <Textarea
          rows={3}
          value={domainsText}
          placeholder={"yourband.com\ntickets.yourband.com"}
          onChange={(event) => {
            setDomainsText(event.target.value);
            set("allowedDomains", event.target.value.split(/[\n,\s]+/).filter(Boolean));
          }}
        />
        <p
          className={cn("text-xs", draft.allowedDomains.length ? "text-fg-muted" : "text-warning")}
        >
          {draft.allowedDomains.length
            ? "One per line. Subdomains (www., maps.) are included. Other sites that copy your snippet get a blocked frame."
            : "Empty = any website can show this map. Add your domain to stop others copying it."}
        </p>
      </Section>
    </div>
  );
}

function Preview({
  draft,
  organizationId,
  onStartView,
}: {
  draft: EmbedDraft;
  organizationId: string | null;
  onStartView: (view: View) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [width, setWidth] = useState<(typeof WIDTHS)[number]["id"]>("hero");
  const [height, setHeight] = useState(520);
  const [view, setView] = useState<View | null>(null);
  const origin = new URL(arOrigin()).origin;
  // Loaded once with the settings at open; later edits go in by postMessage.
  const [src] = useState(() => previewUrl(draft, organizationId));
  const latest = useRef({ ...draft, organizationId });
  useEffect(() => {
    latest.current = { ...draft, organizationId };
  }, [draft, organizationId]);

  const push = useCallback(() => {
    frame.current?.contentWindow?.postMessage(
      { type: "bandcoin-embed:config", config: latest.current },
      origin,
    );
  }, [origin]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin) return;
      const data = event.data as {
        type?: string;
        lat?: number;
        lng?: number;
        zoom?: number;
      } | null;
      if (data?.type === "bandcoin-embed:ready") push();
      if (
        data?.type === "bandcoin-embed:view" &&
        typeof data.lat === "number" &&
        typeof data.lng === "number" &&
        typeof data.zoom === "number"
      )
        setView({ lat: data.lat, lng: data.lng, zoom: data.zoom });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [origin, push]);

  useEffect(() => {
    const timer = setTimeout(push, 150);
    return () => clearTimeout(timer);
  }, [draft, organizationId, push]);

  const sameAsStart =
    view != null &&
    Math.abs(view.lat - draft.centerLat) < 1e-4 &&
    Math.abs(view.lng - draft.centerLng) < 1e-4 &&
    Math.abs(view.zoom - draft.zoom) < 0.05;
  const frameWidth = WIDTHS.find((entry) => entry.id === width)?.width ?? "100%";

  return (
    <div className="bg-surface-2 flex min-h-[520px] flex-col lg:min-h-0 lg:overflow-y-auto">
      <div className="bg-background flex flex-wrap items-center gap-2 border-b px-4 py-2">
        <div className="flex gap-1 rounded-lg border p-0.5">
          {WIDTHS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setWidth(entry.id)}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-xs",
                width === entry.id ? "bg-surface-2 font-medium" : "text-fg-muted",
              )}
            >
              <entry.icon className="size-3.5" /> {entry.label}
            </button>
          ))}
        </div>
        <label className="text-fg-muted flex items-center gap-2 text-xs">
          <Laptop className="size-3.5" /> Height
          <input
            type="range"
            min={360}
            max={760}
            step={20}
            value={height}
            onChange={(event) => setHeight(Number(event.target.value))}
          />
          <span className="num w-12">{height}px</span>
        </label>
        <Button
          size="sm"
          className="ml-auto"
          variant={sameAsStart ? "outline" : "default"}
          disabled={!view || sameAsStart}
          onClick={() => view && onStartView(view)}
        >
          <Crosshair />
          {sameAsStart ? "This is the start view" : "Set start view here"}
        </Button>
      </div>
      <div className="flex flex-1 items-start justify-center overflow-auto p-4">
        <div
          className="bg-background overflow-hidden rounded-xl border shadow-lg transition-[width]"
          style={{ width: frameWidth, maxWidth: "100%", height }}
        >
          <iframe
            ref={frame}
            src={src}
            title="Map preview"
            className="size-full border-0"
            allow="geolocation"
          />
        </div>
      </div>
      <p className="text-fg-muted px-4 pb-3 text-center text-xs">
        Live preview: this is the real map. Stats aren&apos;t counted here.
      </p>
    </div>
  );
}

function LinkField({
  title,
  label,
  url,
  defaultUrl,
  onLabel,
  onUrl,
}: {
  title: string;
  label: string;
  url: string | null;
  defaultUrl: string;
  onLabel: (value: string) => void;
  onUrl: (value: string | null) => void;
}) {
  const on = url != null;
  return (
    <div className="grid gap-2 rounded-xl border p-3">
      <label className="flex cursor-pointer items-center gap-3">
        <span className="flex-1 text-sm font-medium">{title}</span>
        <Switch checked={on} onCheckedChange={(value) => onUrl(value ? defaultUrl : null)} />
      </label>
      {on && (
        <div className="grid gap-2">
          <Input
            value={label}
            maxLength={40}
            onChange={(event) => onLabel(event.target.value)}
            placeholder="Button text"
          />
          <Input
            value={url}
            type="url"
            onChange={(event) => onUrl(event.target.value)}
            placeholder="https://"
          />
          <p className="text-fg-muted text-[11px]">
            Opens in a new tab. Use your own page, or keep Bandcoin&apos;s.
          </p>
        </div>
      )}
    </div>
  );
}
