"use client";

import { Check, ChevronDown, X, type LucideIcon } from "lucide-react";
import { createContext, useContext, useRef, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "../components/button";
import { Label } from "../components/label";
import { Switch } from "../components/switch";
import { Tabs, TabsList, TabsTrigger } from "../components/tabs";
import { cn } from "../lib/cn";
import { useFormCard } from "./form-card";
import { PageBody, PageHeader } from "./page-header";

/** The tab showing in a map card (null: the card has no tabs, everything shows). */
const CardTabContext = createContext<string | null>(null);

/** In a map card with tabs, whether something on `tab` is showing. Always true elsewhere. */
function useCardTabShown(tab?: string) {
  const active = useContext(CardTabContext);
  return !tab || active === null || active === tab;
}

/**
 * Something that isn't a FormSection (a banner, the AI box) that belongs to one tab of the map
 * card. Hidden rather than unmounted, so its fields keep their values and their validation.
 */
export function CardTab({ tab, children }: { tab: string; children: ReactNode }) {
  const shown = useCardTabShown(tab);
  return (
    <div data-card-tab={tab} className={shown ? undefined : "hidden"}>
      {children}
    </div>
  );
}

/**
 * The frame of every create and edit page. Desktop: the form on the left and a
 * sticky side column (preview, summary) on the right, with the actions beside
 * the title. Phones: one column with the actions pinned above the tab bar.
 */
export function FormPage({
  title,
  eyebrow,
  description,
  back,
  aside,
  actions,
  children,
  onSubmit,
  cardTabs,
  cardHeaderAction,
  cardSummary,
  cardTabDone,
  cardSteps,
}: {
  title: ReactNode;
  eyebrow?: string;
  description?: string;
  back: { href: string; label: string };
  aside?: ReactNode;
  actions: ReactNode;
  children: ReactNode;
  onSubmit?: (event: FormEvent) => void;
  /**
   * In a map card, the form is split into these tabs. Sections pick theirs with `tab`; anything
   * without one shows on every tab. The first tab opens first.
   */
  cardTabs?: { id: string; label: string }[];
  /** In a map card, a small control beside the close button (the template picker, Full page). */
  cardHeaderAction?: ReactNode;
  /** In a map card, a strip under the title (the pin as it will look, and what it says so far). */
  cardSummary?: ReactNode;
  /** In a map card, tabs whose required part is filled in get a tick (by tab id). */
  cardTabDone?: Record<string, boolean>;
  /** In a map card, Back / Next walk the tabs in order and the actions show on the last tab. */
  cardSteps?: boolean;
}) {
  const card = useFormCard();
  if (card)
    return (
      <FormCardLayout
        title={title}
        description={description}
        tabs={cardTabs}
        headerAction={cardHeaderAction}
        summary={cardSummary}
        tabDone={cardTabDone}
        steps={cardSteps}
        actions={actions}
        onSubmit={onSubmit}
        onClose={card.onClose}
      >
        {children}
      </FormCardLayout>
    );
  return (
    <form onSubmit={onSubmit} noValidate>
      <PageBody wide className="grid gap-6 pb-40 lg:pb-12">
        <PageHeader
          title={title}
          eyebrow={eyebrow}
          description={description}
          back={back}
          actions={<div className="hidden items-center gap-2 lg:flex">{actions}</div>}
        />
        <div className={cn("grid gap-6", aside && "lg:grid-cols-[minmax(0,1fr)_380px]")}>
          <div className="@container min-w-0 space-y-5">{children}</div>
          {aside && <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">{aside}</aside>}
        </div>
      </PageBody>
      <div className="bg-surface fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-30 flex items-center justify-end gap-2 border-t-2 px-4 py-3 sm:bottom-0 sm:left-[72px] sm:pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden">
        {actions}
      </div>
    </form>
  );
}

/**
 * A form as a floating panel on a map: header, tabs, the tab's fields scrolling, the actions
 * below. The page's side column is left out (the map is right there). Every tab stays mounted
 * (only hidden), so nothing typed is lost; when Save finds a problem on another tab, that tab
 * opens. The scroll area is `relative` so hidden absolutely-placed inputs stay inside it, and
 * `overscroll-contain` keeps a scroll that reaches the end from moving the page.
 */
function FormCardLayout({
  title,
  description,
  tabs,
  headerAction,
  summary,
  tabDone,
  steps = false,
  actions,
  onSubmit,
  onClose,
  children,
}: {
  title: ReactNode;
  description?: string;
  tabs?: { id: string; label: string }[];
  headerAction?: ReactNode;
  summary?: ReactNode;
  tabDone?: Record<string, boolean>;
  steps?: boolean;
  actions: ReactNode;
  onSubmit?: (event: FormEvent) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const [tab, setTab] = useState(tabs?.[0]?.id ?? null);
  const body = useRef<HTMLDivElement>(null);
  const show = (id: string) => {
    setTab(id);
    body.current?.scrollTo({ top: 0 });
  };
  // Back / Next walk the tabs in order; the form's own actions (Create) wait on the last one.
  const index = tabs ? tabs.findIndex((entry) => entry.id === tab) : -1;
  const stepping = steps && tabs !== undefined && index >= 0;
  const last = !stepping || index === tabs!.length - 1;

  // After Save: if the problems are all on other tabs, open the first of them.
  const openProblemTab = () => {
    const root = body.current;
    if (!root || !tabs) return;
    const errors = [...root.querySelectorAll<HTMLElement>('[role="alert"]')];
    const tabOf = (element: HTMLElement) =>
      element.closest<HTMLElement>("[data-card-tab]")?.dataset.cardTab ?? null;
    if (!errors.length || errors.some((error) => tabOf(error) === tab || tabOf(error) === null))
      return;
    const first = tabOf(errors[0]!);
    if (first) show(first);
  };

  return (
    <form
      onSubmit={(event) => {
        onSubmit?.(event);
        // Validation may render after the submit: look once the messages are there.
        window.setTimeout(openProblemTab, 120);
      }}
      noValidate
      className="bg-surface border-fg/10 relative flex max-h-full w-full flex-col overflow-hidden rounded-[1.2rem] border-2 shadow-lg lg:w-[380px]"
    >
      <div className="border-fg/10 border-b-2 p-3">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</p>
          {headerAction && (
            <div className="shrink-0 [&_a]:h-8 [&_a]:px-2.5 [&_a]:text-xs [&_button]:h-8 [&_button]:px-2.5 [&_button]:text-xs">
              {headerAction}
            </div>
          )}
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Close" onClick={onClose}>
            <X />
          </Button>
        </div>
        {description && !summary && (
          <p className="text-fg-muted mt-1 line-clamp-2 text-xs">{description}</p>
        )}
      </div>

      {summary}

      {tabs && tab && (
        <Tabs value={tab} onValueChange={show}>
          <TabsList className="mx-3 mt-3 flex w-[calc(100%-1.5rem)]">
            {tabs.map((entry) => (
              <TabsTrigger key={entry.id} value={entry.id} className="flex-1">
                {entry.label}
                {tabDone?.[entry.id] && (
                  <Check
                    className="text-primary size-3"
                    strokeWidth={3.2}
                    aria-label="Filled in"
                    role="img"
                  />
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      <CardTabContext.Provider value={tabs ? tab : null}>
        <div
          ref={body}
          className="@container relative min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-3"
        >
          {children}
        </div>
      </CardTabContext.Provider>

      <div className="border-fg/10 flex flex-wrap items-center justify-end gap-1.5 border-t-2 p-3 [&_button]:h-8 [&_button]:px-3 [&_button]:text-xs">
        {stepping && index > 0 && (
          <Button
            type="button"
            variant="outline"
            className={last ? undefined : "mr-auto"}
            onClick={() => show(tabs![index - 1]!.id)}
          >
            Back
          </Button>
        )}
        {last ? (
          actions
        ) : (
          <>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={() => show(tabs![index + 1]!.id)}>
              Next: {tabs![index + 1]!.label}
            </Button>
          </>
        )}
      </div>
    </form>
  );
}

/** One titled block of a form page. */
export function FormSection({
  title,
  description,
  icon: Icon,
  children,
  className,
  tab,
}: {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
  /** Which tab of a map card it's on (see FormPage `cardTabs`). Ignored on a page. */
  tab?: string;
}) {
  const card = useFormCard();
  const shown = useCardTabShown(tab);
  if (card)
    // In the card: its own small box, with an icon badge and a bold title.
    return (
      <section
        data-card-tab={tab}
        className={cn(
          "bg-surface-2/50 border-fg/10 rounded-2xl border p-3",
          className,
          !shown && "hidden",
        )}
      >
        <div className="mb-3 flex items-start gap-2.5">
          {Icon && (
            <span className="bg-primary/15 text-primary flex size-7 shrink-0 items-center justify-center rounded-lg">
              <Icon className="size-4" strokeWidth={2.4} aria-hidden />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-sm leading-7 font-semibold">{title}</h2>
            {description && <div className="text-fg-muted -mt-0.5 text-xs">{description}</div>}
          </div>
        </div>
        <div className="space-y-3">{children}</div>
      </section>
    );
  return (
    <section className={cn("bg-surface border-fg/10 rounded-[1.4rem] border-2 p-5", className)}>
      <div className="mb-4">
        <h2 className="display flex items-center gap-2.5 text-3xl">
          {Icon && (
            <span className="bg-primary text-primary-foreground flex size-8 shrink-0 -rotate-6 items-center justify-center rounded-lg">
              <Icon className="size-4" strokeWidth={2.4} />
            </span>
          )}
          {title}
        </h2>
        {description && <div className="text-fg-muted mt-1 text-sm">{description}</div>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/**
 * The optional parts of a form, grouped under one heading. Open by default so
 * every field is in view; people can fold it away. Children stay mounted, so
 * nothing typed is lost when it closes. `open` re-opens it, e.g. when a field
 * inside has an error.
 */
export function MoreOptions({
  title = "More options",
  hint,
  open,
  children,
  className,
  tab,
}: {
  title?: string;
  /** What is inside, so people know whether to look */
  hint?: ReactNode;
  open?: boolean;
  children: ReactNode;
  className?: string;
  /** Which tab of a map card it's on (see FormPage `cardTabs`). Ignored on a page. */
  tab?: string;
}) {
  const card = useFormCard();
  const shown = useCardTabShown(tab);
  if (card)
    return (
      <section
        data-card-tab={tab}
        className={cn(
          "bg-surface-2/50 border-fg/10 rounded-2xl border p-3",
          className,
          !shown && "hidden",
        )}
      >
        <div className="mb-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {hint && <div className="text-fg-muted text-xs">{hint}</div>}
        </div>
        <div className="space-y-5">{children}</div>
      </section>
    );
  return (
    <details
      open
      // Re-opens it on each render while `open` is set, even after someone folded it.
      ref={(element) => {
        if (element && open) element.open = true;
      }}
      className={cn(
        "group/more bg-surface border-fg/10 rounded-[1.4rem] border-2 p-5 [&_summary::-webkit-details-marker]:hidden",
        className,
      )}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="display block text-2xl">{title}</span>
          {hint && <span className="text-fg-muted block text-sm">{hint}</span>}
        </span>
        <ChevronDown className="size-5 shrink-0 transition-transform group-open/more:rotate-180" />
      </summary>
      <div className="space-y-6 pt-5">{children}</div>
    </details>
  );
}

/** A titled group inside MoreOptions: a FormSection without its own card. */
export function OptionGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

/** Label, control and message, the same everywhere. `action` sits at the end of the label row (the AI button). */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  action,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string | null;
  hint?: ReactNode;
  required?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid content-start gap-1.5">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <Label htmlFor={htmlFor}>
          {label}
          {required && <span className="text-danger ml-0.5">*</span>}
        </Label>
        {action}
      </div>
      {children}
      {error ? (
        <p role="alert" className="text-danger text-xs">
          {error}
        </p>
      ) : hint ? (
        <p className="text-fg-faint text-xs">{hint}</p>
      ) : null}
    </div>
  );
}

/** A bordered group of on/off options; each row is a SwitchRow, optionally with its own fields below. */
export function OptionList({ children }: { children: ReactNode }) {
  return <div className="divide-y rounded-lg border">{children}</div>;
}

export function SwitchRow({
  icon: Icon,
  title,
  hint,
  checked,
  onChange,
  disabled,
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Shown while the switch is on */
  children?: ReactNode;
}) {
  return (
    <div>
      <label
        className={cn(
          "flex cursor-pointer items-center gap-3 p-4",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <Icon className="text-primary-text size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{title}</span>
          <span className="text-fg-muted block text-xs">{hint}</span>
        </span>
        <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
      </label>
      {checked && children && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
