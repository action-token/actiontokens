import { type Block, type BlockType, makeBlock } from "@actiontokens/page/blocks";

/**
 * Edits to the page being designed, as plain functions on the list of blocks.
 * The cover always stays first and can't be removed, moved or hidden.
 */

const isCover = (block: Block) => block.type === "cover";

export const addBlock = (blocks: Block[], type: BlockType, uid: string): Block[] =>
  type === "cover" ? blocks : [...blocks, makeBlock(type, uid)];

/** Adds a block right after another one (the + between blocks); at the end if that one is gone. */
export function insertBlock(blocks: Block[], type: BlockType, uid: string, after: string): Block[] {
  if (type === "cover") return blocks;
  const at = blocks.findIndex((block) => block.uid === after);
  if (at < 0) return addBlock(blocks, type, uid);
  const next = [...blocks];
  next.splice(at + 1, 0, makeBlock(type, uid));
  return next;
}

/** Puts a block at a new place in the list (drag and drop), never above the cover. */
export function moveBlockTo(blocks: Block[], uid: string, to: number): Block[] {
  const from = blocks.findIndex((block) => block.uid === uid);
  if (from < 0 || isCover(blocks[from]!)) return blocks;
  const next = [...blocks];
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(1, Math.min(to, next.length)), 0, moved!);
  return next;
}

/** Moves a block one place up (-1) or down (1), never above the cover. */
export function moveBlock(blocks: Block[], uid: string, direction: -1 | 1): Block[] {
  const from = blocks.findIndex((block) => block.uid === uid);
  const to = from + direction;
  if (from < 0 || isCover(blocks[from]!) || to < 1 || to >= blocks.length) return blocks;
  const next = [...blocks];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

export const removeBlock = (blocks: Block[], uid: string): Block[] =>
  blocks.filter((block) => block.uid !== uid || isCover(block));

/** Puts a removed block back where it was (for Undo). */
export function restoreBlock(blocks: Block[], block: Block, index: number): Block[] {
  if (blocks.some((entry) => entry.uid === block.uid)) return blocks;
  const next = [...blocks];
  next.splice(Math.max(1, Math.min(index, next.length)), 0, block);
  return next;
}

export const patchBlock = (
  blocks: Block[],
  uid: string,
  patch: Partial<Pick<Block, "width" | "hidden" | "hideWhenEmpty">>,
): Block[] =>
  blocks.map((block) =>
    block.uid !== uid
      ? block
      : { ...block, ...patch, ...(isCover(block) ? { width: 4 as const, hidden: false } : {}) },
  );

export const setSetting = (blocks: Block[], uid: string, key: string, value: unknown): Block[] =>
  blocks.map((block) =>
    block.uid === uid ? { ...block, settings: { ...block.settings, [key]: value } } : block,
  );
