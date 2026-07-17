/**
 * Grapheme-cluster-safe offset snapping for selection boundaries.
 *
 * Selection ranges (`model.ts`) are expressed as UTF-16 code-unit offsets. A
 * raw offset can legally fall in the middle of a multi-code-unit grapheme
 * cluster — an astral emoji (surrogate pair), a ZWJ sequence (e.g. a family
 * emoji built from several astral code points joined by U+200D), or a base
 * character plus combining marks. Slicing text at such an offset would
 * produce a corrupt fragment: a lone low surrogate, half a ZWJ sequence, or a
 * combining mark detached from its base. `snapToGraphemeBoundary` moves such
 * an offset out to the nearest cluster edge in the requested direction.
 *
 * Widening, not narrowing: callers always snap a slice's start `backward` and
 * its end `forward` (see `resolve.ts#splitTextUnit`), so a selection can only
 * grow to include a whole cluster it partially overlapped — it never shrinks
 * and never drops content the caller asked for.
 */

export type GraphemeDirection = 'backward' | 'forward';

// Minimal ambient typing for `Intl.Segmenter`. This package's `tsconfig`
// targets a `lib` that predates the ES2022 Intl types, so the global type is
// declared locally via merging rather than by widening the shared `lib`
// list. The runtime feature itself is optional (older Hermes lacks it
// entirely) — see `getGraphemeSegmenter` below for the matching runtime
// guard and `snapSurrogatePairOnly` for the fallback used when it is absent.
declare global {
  namespace Intl {
    interface SegmentDataLike {
      segment: string;
      index: number;
      input: string;
      isWordLike?: boolean;
    }
    interface SegmentsLike {
      [Symbol.iterator](): IterableIterator<SegmentDataLike>;
    }
    class Segmenter {
      constructor(
        locales?: string | string[],
        options?: { granularity?: 'grapheme' | 'word' | 'sentence' }
      );
      segment(input: string): SegmentsLike;
    }
  }
}

/**
 * Look up `Intl.Segmenter` freshly on every call (rather than caching the
 * constructed instance) so environments that install/remove the global at
 * runtime — and this package's own fallback tests — observe the current
 * state. Constructing a grapheme segmenter is cheap relative to the slicing
 * work it guards.
 */
function getGraphemeSegmenter(): Intl.Segmenter | undefined {
  const ctor = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  return typeof ctor === 'function' ? new ctor(undefined, { granularity: 'grapheme' }) : undefined;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/**
 * Surrogate-pair-only fallback used when `Intl.Segmenter` is unavailable.
 *
 * This only guarantees an offset never lands between a high/low surrogate
 * pair, i.e. inside a single astral code point. It does NOT reassemble
 * multi-code-point clusters such as ZWJ sequences or base+combining-mark
 * pairs — those can still be split under this fallback. That is an accepted
 * degradation on engines old enough to lack `Intl.Segmenter`; there is no
 * general-purpose grapheme table to fall back on without one.
 */
function snapSurrogatePairOnly(text: string, offset: number, direction: GraphemeDirection): number {
  const before = text.charCodeAt(offset - 1);
  const after = text.charCodeAt(offset);
  if (isHighSurrogate(before) && isLowSurrogate(after)) {
    return direction === 'forward' ? offset + 1 : offset - 1;
  }
  return offset;
}

/**
 * Snap `offset` to the nearest grapheme-cluster boundary of `text` using a
 * real `Intl.Segmenter`. An offset already on a boundary is returned
 * unchanged (including 0 and `text.length`, though those are short-circuited
 * by the caller before this is reached).
 */
function snapWithSegmenter(
  text: string,
  offset: number,
  direction: GraphemeDirection,
  segmenter: Intl.Segmenter
): number {
  let boundaryBefore = 0;
  for (const { index } of segmenter.segment(text)) {
    if (index === offset) return offset;
    if (index > offset) return direction === 'forward' ? index : boundaryBefore;
    boundaryBefore = index;
  }
  // `offset` falls inside the final cluster — `text.length` itself is
  // handled by the caller, so this only triggers for a genuinely interior
  // offset of the last cluster.
  return direction === 'forward' ? text.length : boundaryBefore;
}

/**
 * Snap a UTF-16 `offset` into `text` to the nearest grapheme-cluster
 * boundary in the given `direction`.
 *
 * Callers widen rather than narrow: a partial-slice start is snapped
 * `backward` (never cuts into the cluster it starts in) and a partial-slice
 * end is snapped `forward` (never cuts into the cluster it ends in). An
 * offset already on a boundary — including 0 and `text.length` — is returned
 * unchanged (a no-op).
 */
export function snapToGraphemeBoundary(
  text: string,
  offset: number,
  direction: GraphemeDirection
): number {
  if (offset <= 0) return 0;
  if (offset >= text.length) return text.length;

  const segmenter = getGraphemeSegmenter();
  return segmenter
    ? snapWithSegmenter(text, offset, direction, segmenter)
    : snapSurrogatePairOnly(text, offset, direction);
}
