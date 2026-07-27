import type { SelectionPoint } from '../model';
import type { SelectionUnitIndex } from '../resolve';
import { buildSegmentSpans, segmentOffsetToPoint } from '../native/segmentAdapter';
import type { LayoutRect, RegisteredBlock } from './registry';

/** A point in the `SelectionRoot`'s coordinate space. */
export interface Point {
  x: number;
  y: number;
}

/** True when `p` lies inside (inclusive) the rect. */
export function pointInRect(p: Point, r: LayoutRect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/** Vertical distance from `p` to the rect's y-band; 0 when inside the band. */
export function verticalGap(p: Point, r: LayoutRect): number {
  if (p.y >= r.y && p.y <= r.y + r.h) return 0;
  if (p.y < r.y) return r.y - p.y;
  return p.y - (r.y + r.h);
}

/** Horizontal distance from `p.x` to the rect's x-band; 0 when inside. */
function horizontalGap(p: Point, r: LayoutRect): number {
  if (p.x >= r.x && p.x <= r.x + r.w) return 0;
  if (p.x < r.x) return r.x - p.x;
  return p.x - (r.x + r.w);
}

/**
 * Pick the block a point belongs to. `blocks` must already be in document order
 * so ties resolve to the earlier (upper) block. Returns null only when no block
 * has a layout rect yet.
 */
export function chooseBlock(blocks: readonly RegisteredBlock[], p: Point): RegisteredBlock | null {
  const laid = blocks.filter(
    (b): b is RegisteredBlock & { rect: LayoutRect } => b.rect !== undefined
  );
  if (laid.length === 0) return null;

  // (1) A block that directly contains the point wins (earliest in doc order).
  for (const b of laid) if (pointInRect(p, b.rect)) return b;

  // (2) Blocks whose y-band contains the point: choose nearest by x, ties -> earliest.
  const band = laid.filter(b => verticalGap(p, b.rect) === 0);
  if (band.length > 0) {
    let best = band[0];
    let bestDist = horizontalGap(p, best.rect);
    for (let i = 1; i < band.length; i++) {
      const dist = horizontalGap(p, band[i].rect);
      if (dist < bestDist) {
        best = band[i];
        bestDist = dist;
      }
    }
    return best;
  }

  // (3) Otherwise the block with the smallest vertical gap, ties -> earlier.
  let best = laid[0];
  let bestGap = verticalGap(p, best.rect);
  for (let i = 1; i < laid.length; i++) {
    const gap = verticalGap(p, laid[i].rect);
    if (gap < bestGap) {
      best = laid[i];
      bestGap = gap;
    }
  }
  return best;
}

/**
 * The point just before a block's first unit, or null when the block renders no
 * units at all (a registration whose `updateUnits` has not landed yet). Callers
 * return null rather than emitting `{unitId: undefined}`, which
 * `locateSelectionPoint` would clamp to the DOCUMENT start — a wildly wrong
 * answer dressed up as a valid one.
 */
function blockStartPoint(block: RegisteredBlock): SelectionPoint | null {
  const first = block.unitIds[0];
  if (first === undefined) return null;
  return { nodeId: block.nodeId, unitId: first, offset: 0 };
}

/**
 * The point just after a block's last unit, or null when it renders no units.
 *
 * `offset` is unit-relative and its meaning depends on the unit's kind:
 * `locateSelectionPoint` clamps a text unit's offset into `[0, text.length]`
 * but treats any positive offset on a zero-text unit (atom / boundary) as
 * "after". A hardcoded `offset: 1` therefore means "after" for an atom but
 * "one UTF-16 unit in" for text — so dragging past the bottom of a block
 * ending in `'Hello world'` used to select ONE character instead of eleven.
 */
function blockEndPoint(block: RegisteredBlock, index: SelectionUnitIndex): SelectionPoint | null {
  const last = block.unitIds[block.unitIds.length - 1];
  if (last === undefined) return null;
  const entryIndex = index.byUnitId.get(last);
  const textLength = entryIndex === undefined ? 0 : index.entries[entryIndex].textLength;
  return { nodeId: block.nodeId, unitId: last, offset: textLength > 0 ? textLength : 1 };
}

/**
 * Localize a point inside a chosen block to a `SelectionPoint`. Precise text
 * char-hit needs an injected `block.measure` (device metrics deferred); without
 * one this degrades to a coarse before/after by the point's position relative to
 * the rect's mid-lines. Null when the block renders no units.
 */
export function localizePoint(
  block: RegisteredBlock,
  p: Point,
  index: SelectionUnitIndex
): SelectionPoint | null {
  const rect = block.rect as LayoutRect;
  if (block.measure) {
    const offset = block.measure.localOffsetAt(p.x - rect.x, p.y - rect.y);
    return segmentOffsetToPoint(buildSegmentSpans(block, index), offset);
  }
  const after =
    p.y > rect.y + rect.h / 2 || (verticalGap(p, rect) === 0 && p.x > rect.x + rect.w / 2);
  return after ? blockEndPoint(block, index) : blockStartPoint(block);
}

/**
 * Resolve a root-coordinate point to a document `SelectionPoint`, or null when
 * no block is laid out. Points before the first / after the last block collapse
 * to the document start / end; everything else localizes within its block.
 */
export function resolvePointToSelection(
  blocks: readonly RegisteredBlock[],
  p: Point,
  index: SelectionUnitIndex
): SelectionPoint | null {
  const block = chooseBlock(blocks, p);
  if (!block) return null;
  const rect = block.rect as LayoutRect;
  const laid = blocks.filter(b => b.rect !== undefined);

  // Before the first laid-out block -> document start.
  if (block === laid[0] && p.y < rect.y) {
    return blockStartPoint(block);
  }
  // After the last laid-out block -> document end.
  if (block === laid[laid.length - 1] && p.y > rect.y + rect.h) {
    return blockEndPoint(block, index);
  }
  return localizePoint(block, p, index);
}
