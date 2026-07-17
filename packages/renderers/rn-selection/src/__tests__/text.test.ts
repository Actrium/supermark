import { afterEach, describe, expect, test } from 'bun:test';
import { snapToGraphemeBoundary } from '../text';

describe('snapToGraphemeBoundary (Intl.Segmenter path)', () => {
  test('an offset already on a boundary is a no-op, both directions', () => {
    expect(snapToGraphemeBoundary('hello', 2, 'backward')).toBe(2);
    expect(snapToGraphemeBoundary('hello', 2, 'forward')).toBe(2);
    expect(snapToGraphemeBoundary('hello', 0, 'backward')).toBe(0);
    expect(snapToGraphemeBoundary('hello', 5, 'forward')).toBe(5);
  });

  test('CJK is unaffected: every character is its own cluster', () => {
    // Two CJK characters, written as escapes to keep this source file ASCII-only; boundaries at 0, 1, 2.
    const text = '\u4F60\u597D';
    expect(snapToGraphemeBoundary(text, 1, 'backward')).toBe(1);
    expect(snapToGraphemeBoundary(text, 1, 'forward')).toBe(1);
  });

  test('an astral emoji (surrogate pair) widens outward from its interior offset', () => {
    const text = 'a😀b'; // 'a'=0, surrogate pair at [1,3), 'b'=3, length 4
    expect(snapToGraphemeBoundary(text, 2, 'backward')).toBe(1);
    expect(snapToGraphemeBoundary(text, 2, 'forward')).toBe(3);
  });

  test('a ZWJ family emoji widens an interior offset out to the whole cluster', () => {
    const family = '\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}'; // single cluster, length 11
    const text = `x${family}y`; // 'x'=0, family=[1,12), 'y'=12, length 13
    expect(snapToGraphemeBoundary(text, 5, 'backward')).toBe(1);
    expect(snapToGraphemeBoundary(text, 5, 'forward')).toBe(12);
    // Boundaries at the cluster edges themselves stay put.
    expect(snapToGraphemeBoundary(text, 1, 'backward')).toBe(1);
    expect(snapToGraphemeBoundary(text, 12, 'forward')).toBe(12);
  });

  test('a base character plus combining accent widens an interior offset', () => {
    const text = `caf${'é'}`; // 'c','a','f' each length 1, then a 2-unit cluster; length 5
    expect(snapToGraphemeBoundary(text, 4, 'backward')).toBe(3);
    expect(snapToGraphemeBoundary(text, 4, 'forward')).toBe(5);
  });
});

describe('snapToGraphemeBoundary (surrogate-pair-only fallback)', () => {
  // Simulate an engine without `Intl.Segmenter` (e.g. older Hermes) by hiding
  // it for the duration of each test in this block.
  const realSegmenter = (Intl as { Segmenter?: unknown }).Segmenter;

  afterEach(() => {
    (Intl as { Segmenter?: unknown }).Segmenter = realSegmenter;
  });

  test('still protects a surrogate pair from being split', () => {
    (Intl as { Segmenter?: unknown }).Segmenter = undefined;
    const text = 'a😀b';
    expect(snapToGraphemeBoundary(text, 2, 'backward')).toBe(1);
    expect(snapToGraphemeBoundary(text, 2, 'forward')).toBe(3);
  });

  test('a boundary offset remains a no-op without a segmenter', () => {
    (Intl as { Segmenter?: unknown }).Segmenter = undefined;
    expect(snapToGraphemeBoundary('hello', 2, 'backward')).toBe(2);
    expect(snapToGraphemeBoundary('hello', 2, 'forward')).toBe(2);
  });

  test('documented limitation: a ZWJ join point is not protected by the fallback', () => {
    (Intl as { Segmenter?: unknown }).Segmenter = undefined;
    // Offset lands right after the first person's surrogate pair, i.e. exactly
    // at the ZWJ code unit — not inside any surrogate pair — so the fallback
    // (which only looks at surrogate pairs) leaves it untouched even though a
    // real segmenter would widen it to the whole family cluster.
    const family = '\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}';
    expect(snapToGraphemeBoundary(family, 2, 'backward')).toBe(2);
    expect(snapToGraphemeBoundary(family, 2, 'forward')).toBe(2);
  });
});
