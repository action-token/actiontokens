/** Undo and redo for the mixer: the states before (past) and after (future) the current one. */
export type History<T> = { past: T[]; present: T; future: T[] };

const LIMIT = 100;

export const history = <T>(present: T): History<T> => ({ past: [], present, future: [] });

/** A new edit: the current state goes on the undo list, and redo is cleared. */
export const record = <T>(h: History<T>, next: T): History<T> => ({
  past: [...h.past, h.present].slice(-LIMIT),
  present: next,
  future: [],
});

export const canUndo = (h: History<unknown>) => h.past.length > 0;
export const canRedo = (h: History<unknown>) => h.future.length > 0;

export function undo<T>(h: History<T>): History<T> {
  if (!canUndo(h)) return h;
  return { past: h.past.slice(0, -1), present: h.past.at(-1)!, future: [h.present, ...h.future] };
}

export function redo<T>(h: History<T>): History<T> {
  if (!canRedo(h)) return h;
  return { past: [...h.past, h.present], present: h.future[0]!, future: h.future.slice(1) };
}
