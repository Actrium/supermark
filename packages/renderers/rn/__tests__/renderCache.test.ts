import { describe, expect, it } from 'bun:test';

import './support/mock-react-native';
import { stableSerialize } from '../src/renderCache';

/**
 * Tests for stableSerialize's cache-key behavior.
 *
 * Contract: different option values must produce different keys, otherwise
 * the wrong cached SVG could be returned; a circular reference must not
 * overflow the stack (the useMemo in the render path must not throw a
 * RangeError). Regression coverage for the issue (raised in review) where
 * Date/Map/Set all serialized to {} and collided on the same key.
 */
describe('stableSerialize', () => {
  it('distinguishes options containing different Date values (no longer collide on the same key)', () => {
    const a = { since: new Date('2026-01-01'), label: 'x' };
    const b = { since: new Date('2020-06-15'), label: 'x' };
    expect(stableSerialize(a)).not.toBe(stableSerialize(b));
  });

  it('distinguishes options containing different Map values', () => {
    const a = { tags: new Map([['k', 'v1']]) };
    const b = { tags: new Map([['k', 'v2']]) };
    expect(stableSerialize(a)).not.toBe(stableSerialize(b));
  });

  it('distinguishes options containing different Set values', () => {
    const a = { set: new Set([1, 2, 3]) };
    const b = { set: new Set([4, 5, 6]) };
    expect(stableSerialize(a)).not.toBe(stableSerialize(b));
  });

  it('serializing the same non-plain instance multiple times yields the same key (identity-stable)', () => {
    const date = new Date('2026-01-01');
    expect(stableSerialize({ d: date })).toBe(stableSerialize({ d: date }));
  });

  it('a circular reference does not throw a RangeError', () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expect(() => stableSerialize(cyclic)).not.toThrow();
  });

  it('a plain object is still serialized by structure + sorted keys', () => {
    expect(stableSerialize({ b: 2, a: 1 })).toBe(stableSerialize({ a: 1, b: 2 }));
    expect(stableSerialize({ a: 1 })).not.toBe(stableSerialize({ a: 2 }));
  });

  it('number and string do not collide on the same key', () => {
    expect(stableSerialize(1)).not.toBe(stableSerialize('1'));
  });

  it('null and undefined are each independent', () => {
    expect(stableSerialize(null)).toBe('null');
    expect(stableSerialize(undefined)).toBe('undefined');
    expect(stableSerialize(null)).not.toBe(stableSerialize(undefined));
  });

  it('nested arrays are serialized by structure', () => {
    expect(stableSerialize([1, [2, 3]])).toBe(stableSerialize([1, [2, 3]]));
    expect(stableSerialize([1, [2, 3]])).not.toBe(stableSerialize([1, [2, 4]]));
  });
});
