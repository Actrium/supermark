import { describe, expect, it } from 'bun:test';

import './support/mock-react-native';
import { stableSerialize } from '../src/renderCache';

/**
 * stableSerialize cache-key 行为测试。
 *
 * 契约:不同 option 值必须得到不同 key,否则会返回错误的缓存 SVG;
 * 循环引用不能栈溢出(render 路径的 useMemo 不可抛 RangeError)。
 * 回归 Date/Map/Set 全部序列化成 {} 撞 key 的问题(review 指出)。
 */
describe('stableSerialize', () => {
  it('区分含不同 Date 的 options(不再撞同一个 key)', () => {
    const a = { since: new Date('2026-01-01'), label: 'x' };
    const b = { since: new Date('2020-06-15'), label: 'x' };
    expect(stableSerialize(a)).not.toBe(stableSerialize(b));
  });

  it('区分含不同 Map 的 options', () => {
    const a = { tags: new Map([['k', 'v1']]) };
    const b = { tags: new Map([['k', 'v2']]) };
    expect(stableSerialize(a)).not.toBe(stableSerialize(b));
  });

  it('区分含不同 Set 的 options', () => {
    const a = { set: new Set([1, 2, 3]) };
    const b = { set: new Set([4, 5, 6]) };
    expect(stableSerialize(a)).not.toBe(stableSerialize(b));
  });

  it('同一个非 plain 实例多次序列化得到同一个 key(身份稳定)', () => {
    const date = new Date('2026-01-01');
    expect(stableSerialize({ d: date })).toBe(stableSerialize({ d: date }));
  });

  it('循环引用不抛 RangeError', () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expect(() => stableSerialize(cyclic)).not.toThrow();
  });

  it('plain object 仍按结构 + 排序键序列化', () => {
    expect(stableSerialize({ b: 2, a: 1 })).toBe(stableSerialize({ a: 1, b: 2 }));
    expect(stableSerialize({ a: 1 })).not.toBe(stableSerialize({ a: 2 }));
  });

  it('number 与 string 不撞 key', () => {
    expect(stableSerialize(1)).not.toBe(stableSerialize('1'));
  });

  it('null 与 undefined 各自独立', () => {
    expect(stableSerialize(null)).toBe('null');
    expect(stableSerialize(undefined)).toBe('undefined');
    expect(stableSerialize(null)).not.toBe(stableSerialize(undefined));
  });

  it('嵌套数组按结构序列化', () => {
    expect(stableSerialize([1, [2, 3]])).toBe(stableSerialize([1, [2, 3]]));
    expect(stableSerialize([1, [2, 3]])).not.toBe(stableSerialize([1, [2, 4]]));
  });
});
