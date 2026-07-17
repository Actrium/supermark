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
export function chooseBlock(
  blocks: readonly RegisteredBlock[],
  p: Point
): RegisteredBlock | null {
  const laid = blocks.filter((b): b is RegisteredBlock & { rect: LayoutRect } => b.rect !== undefined);
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
 * Localize a point inside a chosen block to a `SelectionPoint`. Precise text
 * char-hit needs an injected `block.measure` (device metrics deferred); without
 * one this degrades to a coarse before/after by the point's position relative to
 * the rect's mid-lines.
 */
export function localizePoint(
  block: RegisteredBlock,
  p: Point,
  index: SelectionUnitIndex
): SelectionPoint {
  const rect = block.rect as LayoutRect;
  if (block.measure) {
    const offset = block.measure.localOffsetAt(p.x - rect.x, p.y - rect.y);
    return segmentOffsetToPoint(buildSegmentSpans(block, index), offset);
  }
  const after =
    p.y > rect.y + rect.h / 2 || (verticalGap(p, rect) === 0 && p.x > rect.x + rect.w / 2);
  return after
    ? { nodeId: block.nodeId, unitId: block.unitIds[block.unitIds.length - 1], offset: 1 }
    : { nodeId: block.nodeId, unitId: block.unitIds[0], offset: 0 };
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
    return { nodeId: block.nodeId, unitId: block.unitIds[0], offset: 0 };
  }
  // After the last laid-out block -> document end.
  if (block === laid[laid.length - 1] && p.y > rect.y + rect.h) {
    return {
      nodeId: block.nodeId,
      unitId: block.unitIds[block.unitIds.length - 1],
      offset: 1,
    };
  }
  return localizePoint(block, p, index);
}
