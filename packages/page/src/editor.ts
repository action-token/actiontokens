import { BLOCK_STYLES, type BlockWidth, type StyledBlockType } from "./blocks";

/**
 * What the live preview asks the page editor to do when the artist uses the toolbar on a
 * block, or the + between blocks. The preview runs on the fan app and the editor on the
 * artist portal, so these travel as `{ type: "actiontokens-page:action", action }` messages,
 * and the editor reads them with `parsePageAction` (anything else is ignored).
 */
export type PageAction =
  | { kind: "move"; uid: string; direction: -1 | 1 }
  | { kind: "width"; uid: string; width: BlockWidth }
  | { kind: "style"; uid: string; style: string }
  | { kind: "toggle-hidden"; uid: string }
  | { kind: "remove"; uid: string }
  /** Open the block picker to add a block right after this one */
  | { kind: "insert"; after: string };

export const PAGE_ACTION_MESSAGE = "actiontokens-page:action";

const uidOk = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 64;
const styles = new Set<string>(
  Object.values(BLOCK_STYLES).flatMap((options) => options.map((option) => option.value)),
);

/** An action from a message, or null when it isn't one we know. */
export function parsePageAction(value: unknown): PageAction | null {
  if (!value || typeof value !== "object") return null;
  const action = value as Record<string, unknown>;
  switch (action.kind) {
    case "move":
      return uidOk(action.uid) && (action.direction === -1 || action.direction === 1)
        ? { kind: "move", uid: action.uid, direction: action.direction }
        : null;
    case "width":
      return uidOk(action.uid) && [1, 2, 3, 4].includes(action.width as number)
        ? { kind: "width", uid: action.uid, width: action.width as BlockWidth }
        : null;
    case "style":
      return uidOk(action.uid) && typeof action.style === "string" && styles.has(action.style)
        ? { kind: "style", uid: action.uid, style: action.style }
        : null;
    case "toggle-hidden":
    case "remove":
      return uidOk(action.uid) ? { kind: action.kind, uid: action.uid } : null;
    case "insert":
      return uidOk(action.after) ? { kind: "insert", after: action.after } : null;
    default:
      return null;
  }
}

/** The style options of a block type, or none. */
export const stylesFor = (type: string) =>
  (BLOCK_STYLES as Record<string, readonly { value: string; label: string }[]>)[type] ?? [];

export type { StyledBlockType };
