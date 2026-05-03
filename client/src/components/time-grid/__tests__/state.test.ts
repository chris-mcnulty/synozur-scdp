import { describe, it, expect } from "vitest";
import {
  HISTORY_CAP,
  pushHistorySnapshot,
  markDirty,
  markSaving,
  markSaved,
  markError,
  type RowLike,
} from "../state";

function row(overrides: Partial<RowLike> = {}): RowLike {
  return { id: "r1", state: "clean", ...overrides };
}

describe("pushHistorySnapshot", () => {
  it("appends snapshots in order", () => {
    let stack: number[] = [];
    stack = pushHistorySnapshot(stack, 1);
    stack = pushHistorySnapshot(stack, 2);
    stack = pushHistorySnapshot(stack, 3);
    expect(stack).toEqual([1, 2, 3]);
  });

  it("does not mutate the input stack (returns a new array)", () => {
    const original: number[] = [];
    const updated = pushHistorySnapshot(original, 1);
    expect(original).toEqual([]);
    expect(updated).toEqual([1]);
    expect(updated).not.toBe(original);
  });

  it("caps the stack at the configured limit by dropping the oldest entry", () => {
    let stack: number[] = [];
    for (let i = 0; i < 60; i++) {
      stack = pushHistorySnapshot(stack, i);
    }
    expect(stack).toHaveLength(HISTORY_CAP);
    expect(HISTORY_CAP).toBe(50);
    // Oldest entries (0..9) are evicted; newest entry is preserved at the tail
    expect(stack[0]).toBe(10);
    expect(stack[stack.length - 1]).toBe(59);
  });

  it("respects a custom cap argument", () => {
    let stack: string[] = [];
    for (const v of ["a", "b", "c", "d"]) {
      stack = pushHistorySnapshot(stack, v, 2);
    }
    expect(stack).toEqual(["c", "d"]);
  });

  // The grid's undo/redo paths both push onto their counterpart stack via
  // pushHistorySnapshot(), so the cap must hold across an undo→redo cycle.
  it("caps both undo and redo stacks across alternating undo/redo cycles", () => {
    let undoStack: number[] = [];
    let redoStack: number[] = [];

    // Simulate 60 edits — undo stack should saturate at HISTORY_CAP.
    for (let i = 0; i < 60; i++) {
      undoStack = pushHistorySnapshot(undoStack, i);
    }
    expect(undoStack).toHaveLength(HISTORY_CAP);

    // Now perform 60 undos → each pops undo and pushes the current state
    // onto redo. Redo stack should saturate at HISTORY_CAP, never exceed it.
    let current = 60;
    for (let i = 0; i < 60 && undoStack.length > 0; i++) {
      const prev = undoStack[undoStack.length - 1];
      undoStack = undoStack.slice(0, -1);
      redoStack = pushHistorySnapshot(redoStack, current);
      current = prev;
    }
    expect(redoStack.length).toBeLessThanOrEqual(HISTORY_CAP);
    expect(redoStack).toHaveLength(HISTORY_CAP);

    // And then redo back through 60 entries — undo stack must also stay
    // bounded when the redo path pushes back onto it.
    for (let i = 0; i < 60 && redoStack.length > 0; i++) {
      const next = redoStack[redoStack.length - 1];
      redoStack = redoStack.slice(0, -1);
      undoStack = pushHistorySnapshot(undoStack, current);
      current = next;
    }
    expect(undoStack.length).toBeLessThanOrEqual(HISTORY_CAP);
  });
});

describe("row state machine transitions", () => {
  it("clean → dirty when an edit is applied", () => {
    const before = row({ state: "clean" });
    const after = markDirty(before);
    expect(after.state).toBe("dirty");
    expect(after).not.toBe(before); // immutability
  });

  it("dirty → saving clears any prior save error", () => {
    const before = row({ state: "dirty", saveError: "stale failure" });
    const after = markSaving(before);
    expect(after.state).toBe("saving");
    expect(after.saveError).toBeUndefined();
  });

  it("saving → saved adopts the server-generated id when provided", () => {
    const before = row({ id: "tmp_local", state: "saving" });
    const after = markSaved(before, "server-uuid-1");
    expect(after.state).toBe("saved");
    expect(after.serverId).toBe("server-uuid-1");
    expect(after.id).toBe("server-uuid-1");
    expect(after.saveError).toBeUndefined();
  });

  it("saving → saved keeps the existing id when no server id is supplied", () => {
    const before = row({ id: "existing", serverId: "existing", state: "saving" });
    const after = markSaved(before);
    expect(after.state).toBe("saved");
    expect(after.id).toBe("existing");
    expect(after.serverId).toBe("existing");
  });

  it("saving → error surfaces the failure message via saveError", () => {
    const before = row({ state: "saving" });
    const after = markError(before, "Network timeout");
    expect(after.state).toBe("error");
    expect(after.saveError).toBe("Network timeout");
  });

  it("error → dirty (retry path) is supported by markDirty", () => {
    const errored = markError(row({ state: "saving" }), "boom");
    const retried = markDirty(errored);
    expect(retried.state).toBe("dirty");
    // saveError remains visible until the next save attempt clears it
    expect(retried.saveError).toBe("boom");
    const saving = markSaving(retried);
    expect(saving.saveError).toBeUndefined();
  });

  it("supports the full clean → dirty → saving → saved happy path", () => {
    const r0 = row({ state: "clean" });
    const r1 = markDirty(r0);
    const r2 = markSaving(r1);
    const r3 = markSaved(r2, "srv-1");
    expect([r0.state, r1.state, r2.state, r3.state]).toEqual([
      "clean",
      "dirty",
      "saving",
      "saved",
    ]);
  });
});
