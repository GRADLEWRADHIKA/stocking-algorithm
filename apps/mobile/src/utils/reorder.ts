/**
 * Pure helpers behind the long-press-drag watchlist reorder (web: framer-motion Reorder + PUT /order
 * on pointer-up when the order changed).
 */

/** Returns a new array with the element at `from` moved to `to` (indices clamped). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list];
  if (from < 0 || from >= out.length) {
    return out;
  }
  const target = Math.max(0, Math.min(out.length - 1, to));
  const [it] = out.splice(from, 1);
  out.splice(target, 0, it);
  return out;
}

/** Slot a dragged row lands in, given its start index, vertical drag distance and row height. */
export function indexForOffset(from: number, dy: number, rowHeight: number, count: number): number {
  'worklet';
  if (count <= 0 || rowHeight <= 0) {
    return 0;
  }
  const idx = Math.round(from + dy / rowHeight);
  return Math.max(0, Math.min(count - 1, idx));
}

/** Watchlist items sorted by server position → symbols. */
export function orderedSymbols(items: ReadonlyArray<{symbol: string; position: number}>): string[] {
  return [...items].sort((a, b) => a.position - b.position).map(i => i.symbol);
}

/** Calls `commit(after)` only when the order actually changed. Returns whether it committed. */
export function commitIfChanged(before: readonly string[], after: readonly string[], commit: (symbols: string[]) => void): boolean {
  if (before.length === after.length && before.every((s, i) => s === after[i])) {
    return false;
  }
  commit([...after]);
  return true;
}

/** Drop handler: compute the new order for a drag and commit it once if it changed. */
export function finishDrag(
  order: readonly string[],
  from: number,
  dy: number,
  rowHeight: number,
  commit: (symbols: string[]) => void,
): string[] {
  const to = indexForOffset(from, dy, rowHeight, order.length);
  const next = moveItem(order, from, to);
  commitIfChanged(order, next, commit);
  return next;
}
