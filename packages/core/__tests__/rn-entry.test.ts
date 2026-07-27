import { describe, expect, test } from 'bun:test';
import * as reactNativeCore from '../src/index.rn';

describe('@supramark/core React Native entry', () => {
  test('exports the cache utilities consumed by the React Native renderer', () => {
    // The RN renderer imports this public symbol through Metro's react-native condition.
    expect(typeof reactNativeCore.LRUCache).toBe('function');

    const cache = new reactNativeCore.LRUCache<string>({ maxSize: 1 });
    cache.set('diagram', '<svg />');
    expect(cache.get('diagram')).toBe('<svg />');
  });
});
