import type { SelectionUnit } from '../model';
import type { LayoutRect, RegisteredBlock } from './registry';

export type OverlayRect = LayoutRect; // {x,y,w,h} in SelectionRoot coordinate space

export const OVERLAY_MERGE_GAP = 1;

/**
 * Compute block-level highlight rectangles for the current selection. A block is
 * "covered" when any of its `unitIds` appears in `coveredUnits`; the whole block
 * rect highlights even on partial unit coverage (text-precision rects await a
 * native `getSelectionRects` command, which does not yet exist). Vertically
 * contiguous covered rects — those whose vertical gap is within `mergeGap` —
 * merge into a single union box.
 */
export function computeOverlayRects(
  blocks: readonly RegisteredBlock[],
  coveredUnits: readonly SelectionUnit[],
  mergeGap: number = OVERLAY_MERGE_GAP
): OverlayRect[] {
  const covered = new Set(coveredUnits.map(u => u.unitId));
  const rects: LayoutRect[] = [];
  for (const b of blocks) {
    if (!b.rect) continue;
    if (!b.unitIds.some(id => covered.has(id))) continue;
    rects.push(b.rect);
  }
  rects.sort((a, c) => a.y - c.y || a.x - c.x);
  const merged: OverlayRect[] = [];
  for (const r of rects) {
    const last = merged[merged.length - 1];
    if (last && r.y <= last.y + last.h + mergeGap) {
      const x = Math.min(last.x, r.x);
      const y = Math.min(last.y, r.y);
      const right = Math.max(last.x + last.w, r.x + r.w);
      const bottom = Math.max(last.y + last.h, r.y + r.h);
      last.x = x;
      last.y = y;
      last.w = right - x;
      last.h = bottom - y;
    } else {
      // Copy so the merge never mutates a block's live registry rect.
      merged.push({ ...r });
    }
  }
  return merged;
}
