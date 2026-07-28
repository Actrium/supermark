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
 * its end `forward` (see `resolve.ts#splitTextUnit` and
 * `native/segmentAdapter.ts#rangeToSegmentSelection`), so a selection can only
 * grow to include a whole cluster it partially overlapped — it never shrinks
 * and never drops content the caller asked for. Both the clipboard path and
 * the native-highlight path go through here, which is what keeps the two
 * agreeing on where a selection ends.
 *
 * Two implementations, same contract: `Intl.Segmenter` when the engine has it,
 * and the UAX #29 tables in `graphemeBreak.ts` when it does not — which is the
 * normal case on React Native, since Hermes ships no `Intl.Segmenter`.
 */

import { graphemeClusterStarts } from './graphemeBreak';

export type GraphemeDirection = 'backward' | 'forward';

// Minimal ambient typing for `Intl.Segmenter`. This package's `tsconfig`
// targets a `lib` that predates the ES2022 Intl types, so the global type is
// declared locally via merging rather than by widening the shared `lib`
// list. The runtime feature is optional and, on the runtime that matters
// most here, absent: Hermes ships no `Intl.Segmenter`, so React Native takes
// the fallback path on every device. See `getGraphemeSegmenter` below for the
// runtime guard and `snapWithClusterTable` / `graphemeBreak.ts` for what runs
// when it is missing.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- ambient Intl declaration merging requires a namespace
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

/**
 * Fallback used when `Intl.Segmenter` is unavailable — which on React Native
 * means *the normal case*, not a legacy one: Hermes ships no `Intl.Segmenter`.
 *
 * `graphemeBreak.ts` implements UAX #29 extended grapheme cluster boundaries
 * over hand-maintained property tables, so this path reassembles ZWJ emoji
 * sequences, skin-tone modifiers, variation selectors, regional-indicator flag
 * pairs, Hangul syllables and base+combining-mark pairs — not just surrogate
 * pairs. Its documented gap is `SpacingMark` / `Prepend` (Indic spacing vowel
 * signs); see that module's header.
 */
function snapWithClusterTable(text: string, offset: number, direction: GraphemeDirection): number {
  let boundaryBefore = 0;
  for (const index of graphemeClusterStarts(text)) {
    if (index === offset) return offset;
    if (index > offset) return direction === 'forward' ? index : boundaryBefore;
    boundaryBefore = index;
  }
  return direction === 'forward' ? text.length : boundaryBefore;
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
    : snapWithClusterTable(text, offset, direction);
}
