// Pure helpers extracted from time-grid.tsx so they can be unit-tested in
// isolation. Keeping the domain logic out of the React component lets us
// verify the row state machine and the bounded undo/redo stack without
// rendering the grid.

export type RowState = "clean" | "dirty" | "saving" | "saved" | "error";

export interface RowLike {
  state: RowState;
  saveError?: string;
  serverId?: string;
  id: string;
}

export const HISTORY_CAP = 50;

// Append a snapshot to the undo (or redo) stack while enforcing the cap.
// The oldest entry is dropped when the cap is exceeded so the stack never
// grows unbounded across long editing sessions.
export function pushHistorySnapshot<T>(stack: T[], item: T, cap: number = HISTORY_CAP): T[] {
  const next = stack.slice();
  next.push(item);
  while (next.length > cap) next.shift();
  return next;
}

// Row state machine transitions. Each helper returns a new row object so
// callers can use them inside React state updates without mutating prior
// state.
export function markDirty<T extends RowLike>(row: T): T {
  return { ...row, state: "dirty" };
}

export function markSaving<T extends RowLike>(row: T): T {
  return { ...row, state: "saving", saveError: undefined };
}

export function markSaved<T extends RowLike>(row: T, serverId?: string): T {
  return {
    ...row,
    state: "saved",
    saveError: undefined,
    serverId: serverId ?? row.serverId,
    id: serverId ?? row.id,
  };
}

export function markError<T extends RowLike>(row: T, message: string): T {
  return { ...row, state: "error", saveError: message };
}
