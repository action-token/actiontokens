"use client";

import {
  ArrowLeft,
  ExternalLink,
  LayoutTemplate,
  Loader2,
  Monitor,
  MoreHorizontal,
  RotateCcw,
  Smartphone,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

import { BLOCK_DEFS, type Block, type BlockType } from "@bandcoin/page/blocks";
import type { PageTheme } from "@bandcoin/page/theme";
import { Button } from "@bandcoin/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@bandcoin/ui/components/dropdown-menu";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { cn } from "@bandcoin/ui/lib/cn";
import { ConfirmDialog } from "@bandcoin/ui/patterns/confirm-dialog";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";

import { api, type RouterOutputs } from "~/trpc/react";

import { FAN_APP_URL } from "../shell/links";

import { addBlock, moveBlock, patchBlock, removeBlock, restoreBlock, setSetting } from "./draft";
import { PreviewPane } from "./preview-pane";
import { BlockListPanel, SettingsPanel } from "./side-panels";

type EditorData = RouterOutputs["page"]["editor"];
type SaveState = "saved" | "dirty" | "saving" | "error";
type Pane = "preview" | "blocks" | "settings";

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";
const newUid = () => `b-${crypto.randomUUID().slice(0, 8)}`;
const AUTOSAVE_MS = 1200;

/** The page builder: design your public page from blocks, with a live preview. */
export function PageBuilder() {
  const editor = api.page.editor.useQuery(undefined, { refetchOnWindowFocus: false });
  // Bumped after a template or discard so the editor starts again from what the server now holds.
  const [version, setVersion] = useState(0);
  if (editor.isError)
    return <ErrorState message="Couldn't load your page." onRetry={() => void editor.refetch()} />;
  if (!editor.data) return <Skeleton className="m-6 h-[70dvh] rounded-xl" />;
  return (
    <Editor
      key={`${editor.data.layoutId}:${version}`}
      initial={editor.data}
      onReload={async () => {
        await editor.refetch();
        setVersion((value) => value + 1);
      }}
    />
  );
}

function Editor({ initial, onReload }: { initial: EditorData; onReload: () => Promise<void> }) {
  const utils = api.useUtils();
  const [blocks, setBlocks] = useState<Block[]>(initial.blocks);
  const [theme, setTheme] = useState<PageTheme>(initial.theme);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>("saved");
  const [unpublished, setUnpublished] = useState(initial.hasUnpublishedChanges);
  const [published, setPublished] = useState(initial.isPublished);
  const [phone, setPhone] = useState(false);
  const [pane, setPane] = useState<Pane>("preview");
  const [confirm, setConfirm] = useState<null | {
    title: string;
    description: string;
    label: string;
    run: () => Promise<unknown>;
  }>(null);
  const [busy, setBusy] = useState(false);

  // Saves read the newest blocks and theme from here, so a save never sends a stale copy.
  const latest = useRef({ blocks, theme });
  useEffect(() => {
    latest.current = { blocks, theme };
  }, [blocks, theme]);
  const saveDraft = api.page.saveDraft.useMutation();
  const publish = api.page.publish.useMutation();
  const unpublish = api.page.unpublish.useMutation();
  const discard = api.page.discard.useMutation();
  const applyTemplate = api.page.applyTemplate.useMutation();

  const saveNow = useCallback(async () => {
    setSave("saving");
    try {
      const result = await saveDraft.mutateAsync(latest.current);
      setUnpublished(result.hasUnpublishedChanges);
      setSave("saved");
      return true;
    } catch (error) {
      setSave("error");
      toast.error(`Couldn't save: ${messageOf(error)}`);
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the mutation object changes every render; mutateAsync is stable enough here
  }, []);

  // Autosave a moment after the last change.
  useEffect(() => {
    if (save !== "dirty") return;
    const timer = setTimeout(() => void saveNow(), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [save, blocks, theme, saveNow]);

  const edit = (apply: (current: Block[]) => Block[]) => {
    setBlocks(apply);
    setSave("dirty");
  };
  const editTheme = (next: PageTheme) => {
    setTheme(next);
    setSave("dirty");
  };

  const selected = blocks.find((block) => block.uid === selectedUid) ?? null;
  const select = (uid: string | null) => {
    setSelectedUid(uid);
    if (uid) setPane("settings");
  };

  const remove = (uid: string) => {
    const index = blocks.findIndex((block) => block.uid === uid);
    const gone = blocks[index];
    if (!gone) return;
    edit((current) => removeBlock(current, uid));
    setSelectedUid(null);
    toast((t) => (
      <span className="flex items-center gap-3 text-sm">
        {BLOCK_DEFS[gone.type].label} removed
        <button
          type="button"
          className="text-primary-text font-semibold"
          onClick={() => {
            toast.dismiss(t.id);
            edit((current) => restoreBlock(current, gone, index));
          }}
        >
          Undo
        </button>
      </span>
    ));
  };

  const add = (type: BlockType) => {
    const uid = newUid();
    edit((current) => addBlock(current, type, uid));
    select(uid);
  };

  const run = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await confirm.run();
      setConfirm(null);
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const doPublish = async () => {
    if (!(await saveNow())) return;
    try {
      await publish.mutateAsync();
      setPublished(true);
      setUnpublished(false);
      toast.success("Published. Fans see your page now.");
      void utils.page.editor.invalidate();
    } catch (error) {
      toast.error(messageOf(error));
    }
  };

  const status =
    save === "saving"
      ? "Saving…"
      : save === "dirty"
        ? "Unsaved changes"
        : save === "error"
          ? "Couldn't save"
          : !published
            ? "Saved · not published yet"
            : unpublished
              ? "Saved · changes not published yet"
              : "All changes published";

  return (
    <div className="flex w-full flex-col lg:-mb-12 lg:h-dvh lg:overflow-hidden">
      <div className="bg-background sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b px-4 py-3 md:px-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/" aria-label="Back">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="display truncate text-lg">My page</h1>
          <p className={cn("text-xs", save === "error" ? "text-danger" : "text-fg-muted")}>
            {status}
          </p>
        </div>

        <div className="bg-surface-2 hidden gap-1 rounded-lg border p-1 sm:flex">
          {([false, true] as const).map((isPhone) => (
            <button
              key={String(isPhone)}
              type="button"
              aria-pressed={phone === isPhone}
              onClick={() => setPhone(isPhone)}
              className={cn(
                "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs",
                phone === isPhone ? "bg-surface font-medium shadow-sm" : "text-fg-muted",
              )}
            >
              {isPhone ? <Smartphone className="size-3.5" /> : <Monitor className="size-3.5" />}{" "}
              {isPhone ? "Phone" : "Desktop"}
            </button>
          ))}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="More">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="flex items-center gap-1.5">
              <LayoutTemplate className="size-3.5" /> Start from a template
            </DropdownMenuLabel>
            {initial.templates.map((template) => (
              <DropdownMenuItem
                key={template.key}
                className="grid gap-0.5"
                onSelect={() =>
                  setConfirm({
                    title: `Start over from “${template.name}”?`,
                    description:
                      "This replaces your draft with the template. Your published page doesn't change until you publish.",
                    label: "Replace my draft",
                    run: async () => {
                      await applyTemplate.mutateAsync({ key: template.key });
                      await onReload();
                    },
                  })
                }
              >
                <b className="text-sm">{template.name}</b>
                <span className="text-fg-muted text-xs">{template.description}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!unpublished}
              onSelect={() =>
                setConfirm({
                  title: "Discard your changes?",
                  description: published
                    ? "Your draft goes back to what fans see now."
                    : "Your draft goes back to the starter page.",
                  label: "Discard changes",
                  run: async () => {
                    await discard.mutateAsync();
                    await onReload();
                  },
                })
              }
            >
              <RotateCcw /> Discard unpublished changes
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!published}
              variant="destructive"
              onSelect={() =>
                setConfirm({
                  title: "Take your page offline?",
                  description:
                    "Fans see the standard artist page again. Your draft is kept, and you can publish again any time.",
                  label: "Take offline",
                  run: async () => {
                    await unpublish.mutateAsync();
                    setPublished(false);
                    void utils.page.editor.invalidate();
                    toast.success("Your page is offline.");
                  },
                })
              }
            >
              Take page offline
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {published && (
          <Button variant="outline" asChild>
            <a href={`${FAN_APP_URL}/artist/${initial.slug}`} target="_blank" rel="noreferrer">
              View page <ExternalLink />
            </a>
          </Button>
        )}
        <Button
          onClick={() => void doPublish()}
          disabled={
            publish.isPending ||
            save === "saving" ||
            (!unpublished && published && save === "saved")
          }
        >
          {publish.isPending && <Loader2 className="animate-spin" />}
          {published ? "Publish changes" : "Publish page"}
        </Button>
      </div>

      <div
        className="bg-surface-2 flex gap-1 border-b p-1 lg:hidden"
        role="tablist"
        aria-label="Editor sections"
      >
        {(["preview", "blocks", "settings"] as const).map((entry) => (
          <button
            key={entry}
            type="button"
            role="tab"
            aria-selected={pane === entry}
            onClick={() => setPane(entry)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm capitalize",
              pane === entry ? "bg-surface font-medium shadow-sm" : "text-fg-muted",
            )}
          >
            {entry}
          </button>
        ))}
      </div>

      <div className="grid lg:min-h-0 lg:flex-1 lg:grid-cols-[272px_minmax(0,1fr)_340px]">
        <aside
          className={cn(
            "border-b lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-b-0",
            pane !== "blocks" && "max-lg:hidden",
          )}
        >
          <BlockListPanel
            blocks={blocks}
            selectedUid={selectedUid}
            onSelect={select}
            onMove={(uid, direction) => edit((current) => moveBlock(current, uid, direction))}
            onToggleHidden={(uid) =>
              edit((current) =>
                patchBlock(current, uid, {
                  hidden: !current.find((block) => block.uid === uid)?.hidden,
                }),
              )
            }
            onAdd={add}
          />
        </aside>
        <div
          className={cn("flex min-w-0 flex-col lg:min-h-0", pane !== "preview" && "max-lg:hidden")}
        >
          <PreviewPane
            slug={initial.slug}
            blocks={blocks}
            theme={theme}
            selectedUid={selectedUid}
            onSelect={select}
            phone={phone}
          />
        </div>
        <aside
          className={cn(
            "border-t lg:min-h-0 lg:overflow-y-auto lg:border-t-0 lg:border-l",
            pane !== "settings" && "max-lg:hidden",
          )}
        >
          {selected && (
            <div className="border-b px-4 py-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedUid(null)}>
                <ArrowLeft /> Page style
              </Button>
            </div>
          )}
          <SettingsPanel
            block={selected}
            theme={theme}
            onTheme={editTheme}
            onPatch={(uid, patch) => edit((current) => patchBlock(current, uid, patch))}
            onSetting={(uid, key, value) => edit((current) => setSetting(current, uid, key, value))}
            onRemove={remove}
          />
        </aside>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && !busy && setConfirm(null)}
        title={confirm?.title ?? ""}
        description={confirm?.description}
        confirmLabel={confirm?.label}
        destructive={false}
        busy={busy}
        onConfirm={() => void run()}
      />
    </div>
  );
}
