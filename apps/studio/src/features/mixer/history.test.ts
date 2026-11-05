import { describe, expect, it } from "vitest";

import { canRedo, canUndo, history, record, redo, undo } from "./history";

describe("undo history", () => {
  it("steps back and forward through edits", () => {
    let h = history("a");
    h = record(h, "b");
    h = record(h, "c");
    expect(h.present).toBe("c");
    h = undo(h);
    expect(h.present).toBe("b");
    h = undo(h);
    expect(h.present).toBe("a");
    expect(canUndo(h)).toBe(false);
    h = redo(h);
    expect(h.present).toBe("b");
    expect(canRedo(h)).toBe(true);
  });

  it("forgets the redo steps once you edit again", () => {
    let h = record(record(history(1), 2), 3);
    h = record(undo(h), 9);
    expect(h.present).toBe(9);
    expect(canRedo(h)).toBe(false);
    expect(undo(h).present).toBe(2);
  });

  it("does nothing past either end", () => {
    const h = history("a");
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it("keeps the last 100 steps", () => {
    let h = history(0);
    for (let step = 1; step <= 150; step++) h = record(h, step);
    expect(h.past).toHaveLength(100);
    expect(h.past[0]).toBe(50);
  });
});
