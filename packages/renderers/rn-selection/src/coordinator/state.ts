import type { SelectionPoint, SelectionRange, SelectionUnit } from '../model';
import { resolveSelectionRange } from '../resolve';

export type SelectionPhase = 'idle' | 'selecting' | 'selected';

/**
 * Immutable snapshot of the selection. `units` are the covered units derived by
 * the M1 `resolveSelectionRange`; they are empty when idle or collapsed, so UI
 * must treat `phase` (not `units`) as the source of truth for "is selecting".
 */
export interface SelectionSnapshot {
  phase: SelectionPhase;
  range: SelectionRange | null;
  units: readonly SelectionUnit[];
}

export interface SelectionStore {
  // Property-style signatures: every member is a closure with no `this`, safe
  // to pass unbound (e.g. straight into `useSyncExternalStore`).
  getSnapshot: () => SelectionSnapshot;
  subscribe: (l: () => void) => () => void;
  beginAt: (point: SelectionPoint) => void;
  extendTo: (point: SelectionPoint) => void;
  commit: () => void;
  clear: () => void;
}

const EMPTY_IDLE: SelectionSnapshot = { phase: 'idle', range: null, units: [] };

/**
 * External-store selection state machine (`idle -> selecting -> selected`). This
 * module owns only transitions plus snapshot caching; covered-unit derivation is
 * delegated entirely to the M1 `resolveSelectionRange`.
 *
 * `getSnapshot` returns a cached object with a stable reference between actions,
 * so `useSyncExternalStore` never tears; a NEW object is minted only inside
 * `recompute`, right before listeners fire.
 */
export function createSelectionStore(
  getUnits: () => readonly SelectionUnit[]
): SelectionStore {
  let anchor: SelectionPoint | null = null;
  let focus: SelectionPoint | null = null;
  let phase: SelectionPhase = 'idle';
  let snapshot: SelectionSnapshot = EMPTY_IDLE;
  const listeners = new Set<() => void>();

  function currentRange(): SelectionRange | null {
    if (phase === 'idle' || anchor === null || focus === null) return null;
    return { anchor, focus };
  }

  function recompute(): void {
    const range = currentRange();
    const units = range ? resolveSelectionRange(getUnits(), range) : [];
    snapshot = { phase, range, units };
    for (const listener of listeners) listener();
  }

  return {
    getSnapshot() {
      return snapshot;
    },
    subscribe(l) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    beginAt(point) {
      anchor = point;
      focus = point;
      phase = 'selecting';
      // Collapsed anchor === focus: resolveSelectionRange returns [] (M1).
      recompute();
    },
    extendTo(point) {
      // A drag before a begin is ignored: phase, not focus, gates selection.
      if (phase === 'idle') return;
      focus = point;
      phase = 'selecting';
      recompute();
    },
    commit() {
      if (phase === 'selecting' && anchor !== null && focus !== null) {
        phase = 'selected';
      }
      // Covered units are unchanged; a collapsed selection still commits.
      recompute();
    },
    clear() {
      anchor = null;
      focus = null;
      phase = 'idle';
      recompute();
    },
  };
}
