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

describe('snapToGraphemeBoundary (cluster-table fallback)', () => {
  // Hermes — the engine every React Native release ships by default — has no
  // `Intl.Segmenter`, so this block is the ON-DEVICE path, not a legacy one.
  // Hide the global for the duration of each test to exercise it.
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

  test('a ZWJ family emoji is one cluster', () => {
    (Intl as { Segmenter?: unknown }).Segmenter = undefined;
    // 4 astral people joined by 3 ZWJs = 11 UTF-16 units, one cluster.
    const family = '\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}';
    expect(family.length).toBe(11);
    // Offset 2 sits exactly on the first ZWJ — not inside a surrogate pair, so
    // the old surrogate-only fallback left it there and sliced half a family.
    expect(snapToGraphemeBoundary(family, 2, 'backward')).toBe(0);
    expect(snapToGraphemeBoundary(family, 2, 'forward')).toBe(family.length);
    // Every interior offset widens to the whole cluster.
    for (let offset = 1; offset < family.length; offset += 1) {
      expect(snapToGraphemeBoundary(family, offset, 'backward')).toBe(0);
      expect(snapToGraphemeBoundary(family, offset, 'forward')).toBe(family.length);
    }
  });

  test('a skin-tone modifier stays attached to its base emoji', () => {
    (Intl as { Segmenter?: unknown }).Segmenter = undefined;
    const thumbsUp = '\u{1F44D}\u{1F3FD}'; // 👍 + medium skin tone, 4 units
    expect(thumbsUp.length).toBe(4);
    // Offset 2 is the seam between the base and the modifier: copying at 2
    // used to yield a default-yellow 👍, i.e. changed content.
    expect(snapToGraphemeBoundary(thumbsUp, 2, 'backward')).toBe(0);
    expect(snapToGraphemeBoundary(thumbsUp, 2, 'forward')).toBe(4);
  });

  test('a combining accent stays attached to its base letter', () => {
    (Intl as { Segmenter?: unknown }).Segmenter = undefined;
    const text = 'é'; // e + COMBINING ACUTE ACCENT
    expect(snapToGraphemeBoundary(text, 1, 'backward')).toBe(0);
    expect(snapToGraphemeBoundary(text, 1, 'forward')).toBe(2);
  });

  test('an emoji with a variation selector is one cluster', () => {
    (Intl as { Segmenter?: unknown }).Segmenter = undefined;
    const heart = '❤️'; // ❤️ = heart + VS16
    expect(snapToGraphemeBoundary(heart, 1, 'backward')).toBe(0);
    expect(snapToGraphemeBoundary(heart, 1, 'forward')).toBe(2);
  });

  test('regional indicators pair into flags rather than gluing into a run', () => {
    (Intl as { Segmenter?: unknown }).Segmenter = undefined;
    // 🇨🇳🇯🇵 — two flags, 8 UTF-16 units, clusters at 0 and 4.
    const flags = '\u{1F1E8}\u{1F1F3}\u{1F1EF}\u{1F1F5}';
    expect(flags.length).toBe(8);
    expect(snapToGraphemeBoundary(flags, 2, 'backward')).toBe(0);
    expect(snapToGraphemeBoundary(flags, 2, 'forward')).toBe(4);
    // The seam between the two flags is a real boundary and must not move.
    expect(snapToGraphemeBoundary(flags, 4, 'backward')).toBe(4);
    expect(snapToGraphemeBoundary(flags, 4, 'forward')).toBe(4);
    expect(snapToGraphemeBoundary(flags, 6, 'backward')).toBe(4);
    expect(snapToGraphemeBoundary(flags, 6, 'forward')).toBe(8);
  });

  test('CR LF is one cluster', () => {
    (Intl as { Segmenter?: unknown }).Segmenter = undefined;
    expect(snapToGraphemeBoundary('a\r\nb', 2, 'backward')).toBe(1);
    expect(snapToGraphemeBoundary('a\r\nb', 2, 'forward')).toBe(3);
  });

  test('a Hangul syllable built from jamo is one cluster', () => {
    (Intl as { Segmenter?: unknown }).Segmenter = undefined;
    // Hangul jamo L (U+1100) + V (U+1161) + T (U+11A8) compose into ONE
    // syllable cluster. Spelled as escapes: repo convention keeps code and
    // test sources ASCII-only.
    const han = '\u{1100}\u{1161}\u{11A8}';
    expect(snapToGraphemeBoundary(han, 1, 'backward')).toBe(0);
    expect(snapToGraphemeBoundary(han, 2, 'forward')).toBe(3);
  });

  test('the fallback agrees with Intl.Segmenter on every offset of a mixed string', () => {
    // Cross-check: for each offset, the table-driven fallback and a real
    // segmenter must produce the same snap. Skipped if the host lacks
    // Intl.Segmenter, in which case there is nothing to compare against.
    if (typeof realSegmenter !== 'function') return;
    const samples = [
      'plain ascii',
      'café é',
      'a\u{1F600}b',
      '\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}!',
      '\u{1F44D}\u{1F3FD}\u{1F44D}',
      '\u{1F1E8}\u{1F1F3}\u{1F1EF}\u{1F1F5}',
      '❤️❤',
      'x\r\ny',
      '\u{1100}\u{1161}\u{11A8}\u{1100}',
      '\u{4F60}\u{597D}\u{1F600}\u{0301}',
    ];
    for (const text of samples) {
      const expected: number[][] = [];
      for (let offset = 0; offset <= text.length; offset += 1) {
        (Intl as { Segmenter?: unknown }).Segmenter = realSegmenter;
        expected.push([
          snapToGraphemeBoundary(text, offset, 'backward'),
          snapToGraphemeBoundary(text, offset, 'forward'),
        ]);
      }
      for (let offset = 0; offset <= text.length; offset += 1) {
        (Intl as { Segmenter?: unknown }).Segmenter = undefined;
        expect([
          snapToGraphemeBoundary(text, offset, 'backward'),
          snapToGraphemeBoundary(text, offset, 'forward'),
        ]).toEqual(expected[offset]);
      }
    }
  });
});
