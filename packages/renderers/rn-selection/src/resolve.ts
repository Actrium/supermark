import type {
  SelectionPoint,
  SelectionRange,
  SelectionSourceRange,
  SelectionTextUnit,
  SelectionUnit,
} from './model';

export interface UnitIndexEntry {
  unit: SelectionUnit;
  unitIndex: number;
  /** Cumulative UTF-16 start of this unit in the global plain-text stream. */
  startOffset: number;
  /** `unit.text?.length ?? 0` — text/break advance the stream, atoms do not. */
  textLength: number;
}

export interface SelectionUnitIndex {
  entries: UnitIndexEntry[];
  byUnitId: Map<string, number>;
  byNodeId: Map<string, number[]>;
}

/** Length a unit contributes to the global plain-text stream. */
function unitTextLength(unit: SelectionUnit): number {
  if (unit.kind === 'text' || unit.kind === 'break') return unit.text.length;
  return 0;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Index the unit stream in a single pass: accumulate global start offsets and
 * build the `unitId`/`nodeId` lookup maps used by point resolution.
 */
export function buildUnitIndex(units: readonly SelectionUnit[]): SelectionUnitIndex {
  const entries: UnitIndexEntry[] = [];
  const byUnitId = new Map<string, number>();
  const byNodeId = new Map<string, number[]>();
  let startOffset = 0;
  units.forEach((unit, unitIndex) => {
    const textLength = unitTextLength(unit);
    entries.push({ unit, unitIndex, startOffset, textLength });
    byUnitId.set(unit.unitId, unitIndex);
    const existing = byNodeId.get(unit.nodeId);
    if (existing) existing.push(unitIndex);
    else byNodeId.set(unit.nodeId, [unitIndex]);
    startOffset += textLength;
  });
  return { entries, byUnitId, byNodeId };
}

/**
 * Resolve a `SelectionPoint` to a concrete `(unitIndex, intraOffset)`.
 *
 * A direct `unitId` hit wins. Otherwise the units sharing `nodeId` are walked
 * by their text lengths until the offset lands inside one; an offset past the
 * end clamps to the last content unit, and a node made only of zero-text units
 * resolves to its first unit with `intraOffset` encoding before/after.
 */
export function locateSelectionPoint(
  index: SelectionUnitIndex,
  point: SelectionPoint
): { unitIndex: number; intraOffset: number } {
  if (point.unitId !== undefined) {
    const unitIndex = index.byUnitId.get(point.unitId);
    if (unitIndex !== undefined) {
      const entry = index.entries[unitIndex];
      // Zero-text units (atom/boundary) carry no interior; encode before/after
      // exactly like the nodeId walk so a `{unitId, offset: 1}` focus keeps the
      // unit in range instead of collapsing to `before`.
      const intraOffset =
        entry.textLength === 0
          ? point.offset > 0
            ? 1
            : 0
          : clamp(point.offset, 0, entry.textLength);
      return { unitIndex, intraOffset };
    }
  }

  const candidates = index.byNodeId.get(point.nodeId);
  if (candidates && candidates.length > 0) {
    let remaining = point.offset;
    let lastContentIndex = -1;
    for (const unitIndex of candidates) {
      const entry = index.entries[unitIndex];
      if (entry.textLength > 0) {
        lastContentIndex = unitIndex;
        if (remaining <= entry.textLength) {
          return { unitIndex, intraOffset: clamp(remaining, 0, entry.textLength) };
        }
        remaining -= entry.textLength;
      }
    }
    if (lastContentIndex >= 0) {
      // Offset overruns every content unit: clamp to the last one's end.
      return { unitIndex: lastContentIndex, intraOffset: index.entries[lastContentIndex].textLength };
    }
    // Node only has zero-text units: pick the first, before/after by offset.
    return { unitIndex: candidates[0], intraOffset: point.offset > 0 ? 1 : 0 };
  }

  // Nothing matched — clamp to the document start.
  return { unitIndex: 0, intraOffset: 0 };
}

/**
 * Slice a text unit to `[from, to)` while preserving identity.
 *
 * `sourceRange` is shifted so both endpoints are measured from the original
 * `startUtf16` (`startUtf16 + from` / `startUtf16 + to`); if that anchor is
 * missing both stay undefined. Byte offsets are copied verbatim (they cannot be
 * shifted by UTF-16 units) and are only approximate on a partial slice.
 */
export function splitTextUnit(
  unit: SelectionTextUnit,
  from: number,
  to: number
): SelectionTextUnit {
  // Full coverage: return the unit verbatim so its `payload` (whole-unit
  // markdown/source, e.g. an inline-code span or fenced block) survives. A
  // partial slice below deliberately drops the payload — a fence/backtick
  // representation cannot be re-derived for half a unit, so we fall back to the
  // sliced plain text instead of leaking the full syntax into a partial copy.
  if (from <= 0 && to >= unit.text.length) return unit;

  const base = unit.sourceRange;
  const sourceRange: SelectionSourceRange | undefined =
    base === undefined
      ? undefined
      : {
          ...base,
          startUtf16: base.startUtf16 === undefined ? undefined : base.startUtf16 + from,
          endUtf16: base.startUtf16 === undefined ? undefined : base.startUtf16 + to,
        };
  return {
    kind: 'text',
    unitId: unit.unitId,
    nodeId: unit.nodeId,
    text: unit.text.slice(from, to),
    node: unit.node,
    sourceRange,
  };
}

/**
 * Resolve a `SelectionRange` into the ordered units it covers, ready to hand to
 * `serializeSelectionUnits`. Endpoints are normalized (anchor may follow
 * focus), text units at the edges are sliced, interior units are kept verbatim,
 * and edge atoms/boundaries/breaks are included only when fully covered.
 */
export function resolveSelectionRange(
  units: readonly SelectionUnit[],
  range: SelectionRange
): SelectionUnit[] {
  const index = buildUnitIndex(units);
  const a = locateSelectionPoint(index, range.anchor);
  const f = locateSelectionPoint(index, range.focus);

  // Normalize so that `start` precedes `end` in (unitIndex, intraOffset) order.
  let start = a;
  let end = f;
  if (a.unitIndex > f.unitIndex || (a.unitIndex === f.unitIndex && a.intraOffset > f.intraOffset)) {
    start = f;
    end = a;
  }

  // Collapsed selection.
  if (start.unitIndex === end.unitIndex && start.intraOffset === end.intraOffset) {
    return [];
  }

  const startEntry = index.entries[start.unitIndex];
  const endEntry = index.entries[end.unitIndex];

  // Single-unit selection.
  if (start.unitIndex === end.unitIndex) {
    const unit = startEntry.unit;
    if (unit.kind === 'text') {
      return [splitTextUnit(unit, start.intraOffset, end.intraOffset)];
    }
    // A fully covered non-text unit (0 -> 1).
    return [unit];
  }

  const result: SelectionUnit[] = [];

  // First unit.
  const startUnit = startEntry.unit;
  if (startUnit.kind === 'text') {
    result.push(
      start.intraOffset === 0
        ? startUnit
        : splitTextUnit(startUnit, start.intraOffset, startUnit.text.length)
    );
  } else if (start.intraOffset === 0) {
    // Non-text head unit only enters when fully covered (selection begins before it).
    result.push(startUnit);
  }

  // Interior units, verbatim.
  for (let i = start.unitIndex + 1; i < end.unitIndex; i++) {
    result.push(index.entries[i].unit);
  }

  // Last unit.
  const endUnit = endEntry.unit;
  if (endUnit.kind === 'text') {
    if (end.intraOffset > 0) {
      result.push(splitTextUnit(endUnit, 0, end.intraOffset));
    }
  } else if (end.intraOffset >= 1) {
    // Non-text tail unit only enters when its trailing edge is covered.
    result.push(endUnit);
  }

  return result;
}
