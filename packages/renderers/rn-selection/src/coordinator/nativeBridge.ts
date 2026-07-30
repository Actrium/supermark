import type { SelectionNodeId } from '../model';
import { buildSegmentSpans, rangeToSegmentSelection } from '../native/segmentAdapter';
import type { RegisteredBlock, SelectionRegistry } from './registry';
import type { SelectionSnapshot, SelectionStore } from './state';

/**
 * External-store view of which block the bridge has pushed to the native side.
 * The overlay subscribes so it can YIELD for that block — letting the native
 * selection (handles + system menu) paint alone — and only paint cross-block
 * ranges itself. Property-style getters are safe to pass unbound into
 * `useSyncExternalStore`.
 */
export interface NativeBridgePushedStore {
  /** The nodeId the native side is currently showing, or `null` if none. */
  getPushed: () => SelectionNodeId | null;
  /** External-store subscribe; returns the unsubscriber. */
  subscribe: (listener: () => void) => () => void;
}

/**
 * Downlink half of the vendored command bridge: the coordinator store stays
 * the single source of truth, and committed selection state is pushed DOWN to
 * the owning block's native `TextSegmentHandle` (`selectRange` — native
 * handles + system menu — and `clearSelection`). The uplink half already
 * exists: native long-press / menu-action events flow up through
 * `createBlockSink` into the store.
 *
 * Scope is deliberately single-block: native selection is per-text-view by
 * nature, so a committed range is pushed only when every covered unit that a
 * registered block renders belongs to ONE `kind: 'text'` block with a handle.
 * Cross-block selection stays on the coordinator overlay.
 */

export interface NativeSelectionTarget {
  nodeId: SelectionNodeId;
  startUtf16: number;
  endUtf16: number;
}

export type NativeBridgeRegistry = Pick<
  SelectionRegistry,
  'getBlock' | 'getBlockForUnit' | 'index'
>;

/**
 * Decide what the native side should show for a snapshot: the owning block +
 * segment-local range for a committed single-block selection, `null` (native
 * shows nothing) otherwise. Covered units owned by no registered block —
 * trailing breaks, syntax units — do not vote on ownership; a second owning
 * block, an atom/boundary owner, or a handle-less owner all veto the push.
 */
export function planNativeSelection(
  snapshot: SelectionSnapshot,
  registry: NativeBridgeRegistry
): NativeSelectionTarget | null {
  if (snapshot.phase !== 'selected' || snapshot.range === null) return null;

  let owner: RegisteredBlock | null = null;
  for (const unit of snapshot.units) {
    const block = registry.getBlockForUnit(unit.unitId);
    if (!block) continue;
    if (owner === null) owner = block;
    else if (owner.nodeId !== block.nodeId) return null;
  }
  if (owner === null || owner.kind !== 'text' || owner.handle === undefined) return null;

  const spans = buildSegmentSpans(owner, registry.index);
  const segment = rangeToSegmentSelection(snapshot.range, registry.index, spans);
  if (segment === null) return null;
  return { nodeId: owner.nodeId, ...segment };
}

/** Result of wiring the downlink: an unsubscriber plus the pushed-block store. */
export interface NativeBridgeHandle {
  /** Detach the downlink from the store. */
  unsubscribe: () => void;
  /** External-store view of the block the native side is showing. */
  pushedStore: NativeBridgePushedStore;
}

/**
 * Subscribe the downlink to a store. Returns the unsubscriber plus a
 * `pushedStore` the overlay subscribes to so it can yield for the block the
 * native side has taken over (single-block commit) and paint only cross-block
 * ranges itself.
 *
 * Command discipline (`selectRange` pops the system selection menu, so every
 * avoided call is an avoided menu popup):
 * - `selecting` is coordinator-owned drag state: the native side is left
 *   untouched. This also keeps a menu-action reflect (begin / extend / commit
 *   in `createBlockSink`) from clearing and re-selecting — which would re-pop
 *   the menu the user just acted on.
 * - a commit identical to what was already pushed is a no-op (same reason);
 * - a commit that moved to another block clears the previous block first;
 * - `selected` with no plannable target (cross-block, collapsed, atom owner)
 *   and `idle` both clear whatever was pushed.
 *
 * The pushed record tracks what THIS bridge asked natively, not verified
 * native state: a block torn down and remounted by a virtual list comes back
 * deselected, and a re-push only happens when the committed range changes.
 */
export function createNativeBridge(
  store: Pick<SelectionStore, 'getSnapshot' | 'subscribe'>,
  registry: NativeBridgeRegistry
): NativeBridgeHandle {
  let pushed: NativeSelectionTarget | null = null;
  const pushedListeners = new Set<() => void>();

  const notifyPushed = (): void => {
    for (const listener of pushedListeners) listener();
  };
  const pushedStore: NativeBridgePushedStore = {
    getPushed: () => pushed?.nodeId ?? null,
    subscribe: listener => {
      pushedListeners.add(listener);
      return () => {
        pushedListeners.delete(listener);
      };
    },
  };

  const apply = (): void => {
    const snapshot = store.getSnapshot();
    if (snapshot.phase === 'selecting') return;

    const target = planNativeSelection(snapshot, registry);
    if (target === null) {
      if (pushed !== null) {
        registry.getBlock(pushed.nodeId)?.handle?.clearSelection();
        pushed = null;
        notifyPushed();
      }
      return;
    }
    if (
      pushed !== null &&
      pushed.nodeId === target.nodeId &&
      pushed.startUtf16 === target.startUtf16 &&
      pushed.endUtf16 === target.endUtf16
    ) {
      return;
    }
    if (pushed !== null && pushed.nodeId !== target.nodeId) {
      registry.getBlock(pushed.nodeId)?.handle?.clearSelection();
    }
    const handle = registry.getBlock(target.nodeId)?.handle;
    if (handle === undefined) {
      if (pushed !== null) {
        pushed = null;
        notifyPushed();
      }
      return;
    }
    handle.selectRange(target.startUtf16, target.endUtf16);
    pushed = target;
    notifyPushed();
  };

  const unsubscribe = store.subscribe(apply);
  return { unsubscribe, pushedStore };
}
