"use client";

import {
  CalendarDays,
  Crown,
  Disc3,
  FileText,
  Link2,
  Music2,
  Sparkles,
  CircleDot,
  Package,
  User,
  UsersRound,
  Video,
  type LucideIcon,
} from "lucide-react";

import { BLOCK_LIST, type BlockCategory, type BlockType } from "@bandcoin/page/blocks";
import { stylesFor } from "@bandcoin/page/editor";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@bandcoin/ui/components/dialog";

export const BLOCK_ICON: Record<BlockType, LucideIcon> = {
  cover: User,
  about: FileText,
  music: Music2,
  releases: Disc3,
  "nft-gallery": Package,
  membership: Crown,
  tour: CalendarDays,
  links: Link2,
  videos: Video,
  "band-members": UsersRound,
  stories: CircleDot,
  highlights: Sparkles,
};

const CATEGORY: Record<BlockCategory, string> = {
  essentials: "Essentials",
  music: "Music",
  sell: "Sell",
  connect: "Connect",
};

/**
 * Pick a block to add: every block by group, with what it shows and the styles it comes
 * in. Opened by "Add a block" and by the + between blocks in the preview.
 */
export function BlockPicker({
  open,
  onOpenChange,
  onPick,
  where,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (type: BlockType) => void;
  /** Where the block goes, e.g. "after Popular songs" */
  where?: string;
}) {
  const addable = BLOCK_LIST.filter((def) => !def.locked);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="display text-3xl">Add a block</DialogTitle>
          <DialogDescription>
            {where ? `It goes ${where}. ` : ""}You can move it, resize it and change its style
            after.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5">
          {(Object.keys(CATEGORY) as BlockCategory[]).map((category) => {
            const defs = addable.filter((def) => def.category === category);
            if (defs.length === 0) return null;
            return (
              <section key={category} className="grid gap-2" aria-label={CATEGORY[category]}>
                <h3 className="text-fg-faint text-[11px] font-semibold tracking-wider uppercase">
                  {CATEGORY[category]}
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {defs.map((def) => {
                    const Icon = BLOCK_ICON[def.type];
                    const styles = stylesFor(def.type);
                    return (
                      <button
                        key={def.type}
                        type="button"
                        onClick={() => onPick(def.type)}
                        className="hover:border-primary hover:bg-primary/5 group flex items-start gap-3 rounded-xl border-2 p-3 text-left transition-colors"
                      >
                        <span className="bg-surface-2 group-hover:bg-primary group-hover:text-primary-foreground grid size-10 shrink-0 place-items-center rounded-lg transition-colors">
                          <Icon className="size-5" />
                        </span>
                        <span className="grid min-w-0 gap-0.5">
                          <b className="text-sm">{def.label}</b>
                          <span className="text-fg-muted text-xs">{def.description}</span>
                          {styles.length > 0 && (
                            <span className="text-fg-faint mt-1 text-[11px]">
                              {styles.map((style) => style.label).join(" · ")}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
